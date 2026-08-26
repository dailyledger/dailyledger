import DatePicker from 'react-datepicker';

export default function DateField({
  label,
  selected,
  onChange,
  placeholder,
  minDate,
  maxDate,
  hint,
}) {
  return (
    <div className="form-group">
      {label && (
        <label className="form-label">
          {label}
          {hint && <span className="stock-hint">{hint}</span>}
        </label>
      )}
      <DatePicker
        selected={selected}
        onChange={onChange}
        dateFormat="dd MMM yyyy"
        placeholderText={placeholder}
        minDate={minDate}
        maxDate={maxDate}
        className="form-input"
        wrapperClassName="date-field-wrapper"
      />
    </div>
  );
}
