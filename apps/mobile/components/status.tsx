import type { BacklogStatus } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { Ban, Bookmark, Check, CircleStop, Play, Trophy } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';

// Le stesse icone del web (`apps/web/components/status-icon.tsx`): lo stato si
// distingue per l'icona, il colore è uno.
export const statusIcons: Record<BacklogStatus, typeof Bookmark> = {
  backlog: Bookmark,
  playing: Play,
  played: Check,
  completed: Trophy,
  dropped: CircleStop,
  excluded: Ban,
};

export function useStatusLabels() {
  const t = useTranslations('status');
  return Object.fromEntries(
    backlogStatusValues.map((status) => [status, t(status)]),
  ) as Record<BacklogStatus, string>;
}

// Le etichette arrivano da fuori: dentro un foglio di Tamagui, che su native
// passa da un portale, il contesto di use-intl non c'è.
export function StatusSelect({
  value,
  onChange,
  labels,
  width = 200,
}: {
  value: BacklogStatus;
  onChange: (status: BacklogStatus) => void;
  labels: Record<BacklogStatus, string>;
  width?: number;
}) {
  return (
    <Select
      items={labels}
      value={value}
      onValueChange={(next: string) => onChange(next as BacklogStatus)}
    >
      <SelectTrigger width={width} height={44} minH={44}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {backlogStatusValues.map((status) => (
          <SelectItem key={status} value={status}>
            {labels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
