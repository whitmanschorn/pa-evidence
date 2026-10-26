import { Badge } from '@mantine/core';
import type { CriterionStatus, Route } from '@pa/shared';
import { IconAlertTriangle, IconCheck, IconQuestionMark, IconX } from '@tabler/icons-react';

// One palette everywhere. Each status shows an icon and a label, never colour alone (the icons are what let
// red-green colourblind users tell met from not met). The colour is in the tint and the icon; the label is dark,
// because coloured text on its own tint is under 4.5:1 even at the darkest shade (green 9 is about 4.2:1).
const STATUS: Record<CriterionStatus, { label: string; color: string; Icon: typeof IconCheck }> = {
  met: { label: 'Met', color: 'green', Icon: IconCheck },
  not_met: { label: 'Not met', color: 'red', Icon: IconX },
  missing: { label: 'Missing', color: 'blue', Icon: IconQuestionMark },
  conflicting: { label: 'Conflicting', color: 'yellow', Icon: IconAlertTriangle },
};

export function StatusBadge({ status }: { status: CriterionStatus }) {
  const { label, color, Icon } = STATUS[status];
  return (
    <Badge variant="light" color={color} c="gray.9" leftSection={<Icon size={14} color={`var(--mantine-color-${color}-9)`} aria-hidden />}>
      {label}
    </Badge>
  );
}

// The request-level route stays neutral, so a row of green checks never reads as a verdict.
export function RouteBadge({ route }: { route: Route }) {
  return route === 'evidence_complete' ? (
    <Badge variant="light" color="indigo" c="indigo.9">
      Evidence complete
    </Badge>
  ) : (
    <Badge variant="light" color="gray" c="gray.9">
      Needs clinician review
    </Badge>
  );
}
