import { useRef, type ReactElement } from 'react';
import { Dialog as DialogBase, XStack, YStack, isWeb, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

import { X } from '../icons';
import { Button } from './button';

export { Dialog } from 'tamagui';

export function DialogTrigger({ render }: { render: ReactElement }) {
  return <DialogBase.Trigger asChild>{render}</DialogBase.Trigger>;
}

export function DialogClose({ render }: { render: ReactElement }) {
  return <DialogBase.Close asChild>{render}</DialogBase.Close>;
}

type DialogContentProps = Omit<GetProps<typeof DialogBase.Content>, 'size'> & {
  showCloseButton?: boolean;
  closeLabel?: string;
  size?: 'compact' | 'default' | 'wide';
};

const widths = { compact: 440, default: 560, wide: 720 };

export function DialogContent({
  children,
  showCloseButton = true,
  closeLabel = 'Close',
  size = 'default',
  ...props
}: DialogContentProps) {
  const returnFocusTo = useRef<HTMLElement | null>(null);
  // Il portale può spostare il focus prima di onOpenAutoFocus.
  if (isWeb && typeof document !== 'undefined') {
    const focused = document.activeElement as HTMLElement | null;
    if (
      focused &&
      focused !== document.body &&
      !focused.closest('[role="dialog"], dialog')
    ) {
      returnFocusTo.current = focused;
    }
  }

  // Il frame Tamagui impone width:auto sul web: l'inline evita il gutter laterale.
  return (
    <DialogBase.Portal
      {...(isWeb ? { style: { width: '100vw' as never } } : {})}
    >
      <DialogBase.Overlay
        key="overlay"
        bg="shadow6"
        transition="quick"
        opacity="1 enter:0 exit:0"
      />
      <DialogBase.Content
        key="content"
        width={isWeb ? ('calc(100vw - 32px)' as never) : '100%'}
        maxW={widths[size]}
        // dvh include la barra mobile del browser quando è visibile.
        maxH={isWeb ? ('calc(100dvh - 32px)' as never) : '90%'}
        mx={16}
        p={0}
        rounded={20}
        bg="color2"
        borderWidth={1}
        borderColor="border-color"
        shadowColor="shadow6"
        shadowRadius={32}
        shadowOffset={{ width: 0, height: 16 }}
        overflow="hidden"
        transition="quick"
        opacity="1 enter:0 exit:0"
        scale="1 enter:0.98 exit:0.98"
        {...props}
        onCloseAutoFocus={(event) => {
          props.onCloseAutoFocus?.(event);
          // Le dialog controllate non hanno necessariamente un Dialog.Trigger.
          if (!event.defaultPrevented && returnFocusTo.current?.isConnected) {
            event.preventDefault();
            returnFocusTo.current.focus();
          }
        }}
      >
        <YStack
          p="24px max-sm:20px"
          gap="24px max-sm:20px"
          minH={0}
          shrink={1}
          {...(isWeb
            ? {
                maxH: 'inherit' as const,
                style: {
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  scrollPaddingBlock: '56px 128px',
                },
              }
            : {})}
        >
          {children}
        </YStack>
        {showCloseButton && (
          <DialogBase.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              position="absolute"
              t="16px max-sm:12px"
              r="16px max-sm:12px"
              rounded={999}
              bg="color2"
              style={{ zIndex: 3 }}
              aria-label={closeLabel}
            >
              <X size={18} />
            </Button>
          </DialogBase.Close>
        )}
      </DialogBase.Content>
    </DialogBase.Portal>
  );
}

export const DialogHeader = styled(YStack, {
  name: 'DialogHeader',
  gap: 6,
});

export const DialogFooter = styled(XStack, {
  name: 'DialogFooter',
  mx: '-24px max-sm:-20px',
  mb: '-24px max-sm:-20px',
  mt: 4,
  px: '24px max-sm:20px',
  py: 20,
  gap: 10,
  justify: 'flex-end',
  flexDirection: 'row max-sm:column-reverse',
  borderTopWidth: 1,
  borderColor: 'border-color',
  bg: 'color2',
  ...(isWeb
    ? { position: 'sticky' as never, b: '-24px max-sm:-20px' }
    : {}),
  style: { zIndex: 2 },
});

export const DialogTitle = styled(DialogBase.Title, {
  name: 'DialogTitle',
  fontFamily: 'heading',
  pr: 40,
  fontSize: 20,
  lineHeight: '28px',
  fontWeight: '600',
  color: 'color12',
  m: 0,
});

export const DialogDescription = styled(DialogBase.Description, {
  name: 'DialogDescription',
  fontSize: 14,
  lineHeight: '22px',
  color: 'color11',
  m: 0,
});

export type DialogProps = GetProps<typeof DialogBase>;
export type { DialogContentProps };
