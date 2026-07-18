// admin/components/DevicesView.jsx
import React from 'react';
import { Box, Label } from '@adminjs/design-system';

const DevicesView = (props) => {
  const { record } = props;
  const devices = record?.params?.devices || [];

  if (devices.length === 0) {
    return <Box>No devices registered</Box>;
  }

  return (
    <Box>
      <Label>Devices ({devices.length})</Label>
      {devices.map((d, i) => (
        <Box key={i} border="1px solid" borderColor="grey20" padding="default" marginBottom="default">
          <Box><strong>Device ID:</strong> {d.deviceId}</Box>
          <Box><strong>Name:</strong> {d.deviceName || '—'}</Box>
          <Box><strong>Model:</strong> {d.deviceModel || '—'}</Box>
          <Box><strong>Platform:</strong> {d.platform || '—'}</Box>
          <Box><strong>Push Token:</strong> {d.expoPushToken || '—'}</Box>
          <Box><strong>Notifications Enabled:</strong> {String(d.notificationsEnabled)}</Box>
          <Box><strong>Last Login:</strong> {d.lastLoginAt ? new Date(d.lastLoginAt).toLocaleString() : '—'}</Box>
        </Box>
      ))}
    </Box>
  );
};

export default DevicesView;