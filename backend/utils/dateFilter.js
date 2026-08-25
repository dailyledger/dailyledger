function buildDateFilter(req) {
  const { from, to } = req.query;

  if (!from && !to) {
    return {};
  }

  const date = {};
  if (from) date.$gte = new Date(`${from}T00:00:00.000`);
  if (to) date.$lte = new Date(`${to}T23:59:59.999`);

  return { date };
}

module.exports = buildDateFilter;
