import DatePicker from 'react-datepicker';
import { CalendarDays } from 'lucide-react';

// The admin console passes dates around as local "YYYY-MM-DD" strings.
const toDate = (iso) => {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

// While someone types "20 Oc" the picker reports an invalid date; treat that as
// empty instead of passing it on, which used to crash the page.
const toIso = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/** Calendar picker in the admin theme: month/year dropdowns, Today shortcut, clearable. */
export default function AdminDateField({ value, onChange, min, max, invalid, placeholder = 'Select date' }) {
  return (
    <div className={`a-date${invalid ? ' invalid' : ''}`}>
      <CalendarDays size={16} className="a-date-icon" />
      <DatePicker
        selected={toDate(value)}
        onChange={(date) => {
          // A half-typed year ("20 Oct 2") parses as year 0002. Ignore partial dates so
          // the text box keeps what the person is typing; clearing sends null.
          if (date && date.getFullYear() < 2000) return;
          onChange(toIso(date));
        }}
        strictParsing
        minDate={toDate(min) || undefined}
        maxDate={toDate(max) || undefined}
        dateFormat="dd MMM yyyy"
        placeholderText={placeholder}
        className="a-input"
        wrapperClassName="a-date-wrap"
        popperClassName="a-datepicker"
        showPopperArrow={false}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        todayButton="Today"
        isClearable
        autoComplete="off"
      />
    </div>
  );
}
