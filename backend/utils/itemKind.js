const Item = require('../models/Item');
const Sale = require('../models/Sale');
const Credit = require('../models/Credit');
const Production = require('../models/Production');
const { BadRequestError } = require('./dateFilter');

const escapeRegex = (text) => String(text).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Change an item between "resale" and "raw material". The first purchase decides the
 * type, and people pick the wrong one, so it can be corrected until it would change
 * what already happened:
 *  - resale -> raw is refused once the item has been sold (or put on credit);
 *  - raw -> resale is refused once the item has been used in cooking.
 * A cooked dish is made, not bought, so its type never changes.
 */
async function changeItemKind(shop, item, newKind, session) {
  const current = item.kind || 'resale';
  if (current === newKind) return item;

  if (current === 'cooked' || newKind === 'cooked' || !['resale', 'raw'].includes(newKind)) {
    throw new BadRequestError(`"${item.item_name}" is a cooked dish, so its type cannot be changed.`);
  }

  const name = { $regex: `^${escapeRegex(item.item_name)}$`, $options: 'i' };
  const opts = session ? { session } : undefined;

  if (newKind === 'raw') {
    const sold = await Promise.all([
      Sale.exists({ shop, voided_at: null, 'items.item_name': name }),
      Credit.exists({ shop, voided_at: null, 'items.item_name': name }),
    ]);
    if (sold.some(Boolean)) {
      throw new BadRequestError(
        `"${item.item_name}" has already been sold, so it cannot become a raw material. ` +
          'Cancel those sales first.'
      );
    }
  } else if (await Production.exists({ shop, voided_at: null, 'ingredients.item_name': name })) {
    throw new BadRequestError(
      `"${item.item_name}" has been used in cooking, so it cannot become a resale item. ` +
        'Cancel those cooking batches first.'
    );
  }

  await Item.updateOne({ _id: item._id, shop }, { $set: { kind: newKind } }, opts);
  return item;
}

module.exports = { changeItemKind };
