// admin/components/SendNotificationForm.jsx
import React, { useState } from 'react';
import { Box, Label, Input, Button, FormGroup, DropZone, MessageBox, Text, Select } from '@adminjs/design-system';
import { ApiClient } from 'adminjs';

const api = new ApiClient();

// Preset images the admin can pick without uploading their own.
// Add/replace with whatever image URLs make sense for your app.
const DEFAULT_IMAGE_OPTIONS = [
  { value: 'https://storage.katha.today/notifications/default-reminder.png', label: 'Default reminder image' },
  { value: '', label: 'No image' },
];

const SendNotificationForm = (props) => {
  const { resource } = props;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_IMAGE_OPTIONS[0]);
  const [customImageFile, setCustomImageFile] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [resultNotice, setResultNotice] = useState(null);

  const handleCustomImageChange = (files) => {
    setCustomImageFile(files && files.length > 0 ? files[0] : null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setResultNotice({ type: 'danger', message: 'Title and body are both required.' });
      return;
    }

    setIsSending(true);
    setResultNotice(null);

    const formData = new FormData();
    formData.set('title', title);
    formData.set('body', body);

    if (customImageFile) {
      formData.set('image', customImageFile);
    } else if (selectedPreset?.value) {
      formData.set('presetImageUrl', selectedPreset.value);
    }

    try {
      const response = await api.resourceAction({
        resourceId: resource.id,
        actionName: 'sendNotification',
        data: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const stats = response?.data?.stats;
      setResultNotice({
        type: 'success',
        message: stats
          ? `Sent: ${stats.sent} · Failed: ${stats.failed} · Dead tokens removed: ${stats.invalidRemoved}`
          : 'Notification sent.',
      });
      setTitle('');
      setBody('');
      setCustomImageFile(null);
    } catch (submitError) {
      setResultNotice({
        type: 'danger',
        message: submitError?.response?.data?.errorMessage || 'Failed to send notification. Check the server logs.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Box variant="white" p="xl">
      <Text as="h2" mb="lg">Send Push Notification</Text>

      {resultNotice && (
        <MessageBox mb="lg" variant={resultNotice.type} message={resultNotice.message} />
      )}

      <Box as="form" onSubmit={handleSubmit}>
        <FormGroup>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Need a restroom?"
            required
          />
        </FormGroup>

        <FormGroup>
          <Label>Body</Label>
          <Input
            as="textarea"
            rows={3}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Open UrbanLoo to find one near you."
            required
          />
        </FormGroup>

        <FormGroup>
          <Label>Preset image (used unless you upload a custom one below)</Label>
          <Select
            value={selectedPreset}
            options={DEFAULT_IMAGE_OPTIONS}
            onChange={(option) => setSelectedPreset(option)}
            isDisabled={!!customImageFile}
          />
        </FormGroup>

        <FormGroup>
          <Label>Or upload a custom image</Label>
          <DropZone
            onChange={handleCustomImageChange}
            multiple={false}
            validate={{ mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] }}
          />
        </FormGroup>

        <Button type="submit" variant="primary" disabled={isSending}>
          {isSending ? 'Sending…' : 'Send to all users'}
        </Button>
      </Box>
    </Box>
  );
};

export default SendNotificationForm;