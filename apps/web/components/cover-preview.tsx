import { Dialog, DialogContent, DialogTitle, Text, YStack } from '@repo/ui';
import { ZoomIn } from '@repo/ui/icons';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

export function CoverPreview({
  sources,
  name,
  width = 72,
  desktopWidth = width,
  fallback,
}: {
  sources: string[];
  name: string;
  width?: number;
  desktopWidth?: number;
  fallback?: ReactNode;
}) {
  const t = useTranslations('gameMatch');
  const [failed, setFailed] = useState(0);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const source = sources[failed];

  if (!source) {
    return (
      <YStack
        width={width}
        $lg={{ width: desktopWidth }}
        aspectRatio={90 / 128}
        shrink={0}
        items="center"
        justify="center"
        rounded={8}
        bg="$color4"
        aria-hidden
      >
        {fallback ?? <Text color="$color11">—</Text>}
      </YStack>
    );
  }

  return (
    <>
      <YStack
        render="button"
        ref={trigger as never}
        position="relative"
        width={width}
        $lg={{ width: desktopWidth }}
        aspectRatio={90 / 128}
        shrink={0}
        p={0}
        rounded={8}
        borderWidth={0}
        bg="$color4"
        cursor="zoom-in"
        overflow="hidden"
        aria-label={t('enlargeCover', { name })}
        {...({ type: 'button' } as object)}
        onPress={() => setOpen(true)}
        hoverStyle={{ opacity: 0.85 }}
        focusVisibleStyle={{
          outlineColor: '$outlineColor',
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineOffset: 2,
        }}
      >
        <img
          key={source}
          src={source}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed((value) => value + 1)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <YStack
          position="absolute"
          b={4}
          r={4}
          p={4}
          rounded={4}
          bg="$color2"
          pointerEvents="none"
        >
          <ZoomIn size={14} color="$color12" />
        </YStack>
      </YStack>
      <Dialog modal open={open} onOpenChange={setOpen}>
        <DialogContent
          size="wide"
          closeLabel={t('close')}
          onCloseAutoFocus={(event) => {
            // Il trigger è nella dialog sottostante, fuori dal ripristino
            // previsto dal contenitore per i trigger nella pagina.
            if (trigger.current?.isConnected) {
              event.preventDefault();
              trigger.current.focus();
            }
          }}
        >
          <DialogTitle>{name}</DialogTitle>
          <img
            src={source}
            alt={t('coverAlt', { name })}
            referrerPolicy="no-referrer"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 'calc(100dvh - 180px)',
              objectFit: 'contain',
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
