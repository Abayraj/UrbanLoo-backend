// admin/components/ExistingImagesManager.jsx
import React, { useState } from 'react';
import { Box, Label, Button, Text } from '@adminjs/design-system';
import { ApiClient } from 'adminjs';

const api = new ApiClient();

const ExistingImagesManager = (props) => {
  const { record } = props;
  const [images, setImages] = useState(record?.params?.images || []);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (attachmentId) => {
    setDeletingId(attachmentId);
    try {
      const response = await api.recordAction({
        resourceId: 'Location',
        recordId: record.params._id,
        actionName: 'deleteImage',
        params: { attachmentId },
      });
      setImages(response.data.images || []);
    } catch (err) {
      console.error('Failed to delete image:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (images.length === 0) {
    return <Box marginBottom="default"><Text>No existing images</Text></Box>;
  }

  return (
    <Box marginBottom="default">
      <Label>Existing Images ({images.length})</Label>
      <Box display="flex" flexWrap="wrap" style={{ gap: '12px' }}>
        {images.map((img) => (
          <Box key={img.attachmentId} style={{ width: '150px' }}>
            <img
              src={img.url}
              alt={img.filename}
              style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '4px' }}
            />
            <Button
              type="button"
              size="sm"
              variant="danger"
              style={{ width: '100%', marginTop: '4px' }}
              onClick={() => handleDelete(img.attachmentId)}
              disabled={deletingId === img.attachmentId}
            >
              {deletingId === img.attachmentId ? 'Deleting...' : 'Delete'}
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default ExistingImagesManager;