// admin/components/ImagesUploadInput.jsx
import React from 'react';
import { FormGroup, Label, DropZone } from '@adminjs/design-system';

const ImagesUploadInput = (props) => {
  const { property, onChange } = props;

  const handleChange = (files) => {
    onChange(property.path, files);
  };

  return (
    <FormGroup>
      <Label>{property.label || 'Upload Images'}</Label>
      <DropZone onChange={handleChange} multiple validate={{ mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] }} />
    </FormGroup>
  );
};

export default ImagesUploadInput;