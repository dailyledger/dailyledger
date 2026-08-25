import DatePicker from 'react-datepicker';

export default function DateField({ label, selected, onChange, placeholder, maxDate }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <DatePicker
        selected={selected}
        onChange={onChange}
        dateFormat="dd MMM yyyy"
        placeholderText={placeholder}
        maxDate={maxDate}
        className="form-input"
        wrapperClassName="date-field-wrapper"
      />
    </div>
  );
}
