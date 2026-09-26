import React, { useEffect } from 'react';
import { FormGroup, Label, Select, FormMessage } from '@adminjs/design-system';

const DistrictSelect = ({ property, record, onChange }) => {
  const statesDistricts = property.custom?.statesDistricts || {};
  const state = record.params?.state;
  const districts = statesDistricts[state] || [];
  const value = record.params?.[property.path] || '';
  const error = record.errors?.[property.path];

  // Clear the district if it doesn't belong to the newly selected state
  useEffect(() => {
    if (value && !districts.includes(value)) {
      onChange(property.path, '');
    }
  }, [state]);

  const options = districts.map((d) => ({ value: d, label: d }));

  return (
    <FormGroup error={Boolean(error)}>
      <Label required={property.isRequired}>{property.label}</Label>
      <Select
        value={options.find((o) => o.value === value) || null}
        options={options}
        isDisabled={!state}
        placeholder={state ? 'Select district' : 'Select a state first'}
        onChange={(selected) => onChange(property.path, selected ? selected.value : '')}
      />
      {error && <FormMessage>{error.message}</FormMessage>}
    </FormGroup>
  );
};

export default DistrictSelect;