import { useEffect, useState } from 'react';
import { adminGetStalls } from '../../api';

/** A stall is a customer: its name is what the admin picks in every filter. */
export function customerOption(stall) {
  return { id: stall.id, label: stall.name };
}

/** All stalls as multi-select options. One fetch per page is plenty. */
export function useCustomerOptions() {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    adminGetStalls()
      .then((stalls) => setOptions(stalls.map(customerOption)))
      .catch(() => setOptions([]));
  }, []);
  return options;
}

/** Local YYYY-MM-DD (not UTC, so "today" is the admin's today). */
export function isoToday() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
