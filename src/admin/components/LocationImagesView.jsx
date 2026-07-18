// admin/components/LocationImagesView.jsx
import React from 'react';
import { Box, Label } from '@adminjs/design-system';

const LocationImagesView = (props) => {
  const { record } = props;
  const images = record?.params?.images || [];

  if (images.length === 0) {
    return <Box>No images uploaded</Box>;
  }

  return (
    <Box>
      <Label>Images ({images.length})</Label>
      <Box display="flex" flexWrap="wrap" style={{ gap: '12px' }}>
        {images.map((img) => (
          <Box key={img.attachmentId} style={{ width: '150px' }}>
            <img
              src={img.url}
              alt={img.filename}
              style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }}
            />
            <Box style={{ fontSize: '11px', marginTop: '4px', wordBreak: 'break-all' }}>{img.filename}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default LocationImagesView;