import { Center, Loader, Stack, Text } from '@mantine/core';

// A spinner centred in its space, with room around it and a short line saying what is loading. role="status" lets a
// screen reader announce that line.
export function CenteredLoader({ label }: { label: string }) {
  return (
    <Center py="xl" role="status">
      <Stack align="center" gap="xs">
        <Loader aria-hidden />
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Center>
  );
}
