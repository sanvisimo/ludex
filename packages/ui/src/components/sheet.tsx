import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  isWeb,
  Sheet as SheetBase,
  YStack,
  type TamaguiElement,
} from 'tamagui';

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: ReactNode;
};

export function Sheet({ open, onOpenChange, label, children }: SheetProps) {
  const container = useRef<TamaguiElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isWeb || !open) return;
    // Il FocusScope può montarsi dopo che il foglio ha già preso il focus.
    const active = document.activeElement;
    const sheet = container.current;
    trigger.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !(sheet instanceof HTMLElement && sheet.contains(active))
        ? active
        : null;
  }, [open]);

  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() =>
        (container.current as HTMLElement | null)?.focus?.(),
      );
      return () => cancelAnimationFrame(frame);
    }

    const target = trigger.current;
    trigger.current = null;
    if (!isWeb || !target) return;

    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      const sheet = container.current;
      // Rispetta un focus già spostato fuori, per esempio da una navigazione.
      if (
        target.isConnected &&
        (active === document.body ||
          (sheet instanceof HTMLElement && sheet.contains(active)))
      ) {
        target.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <SheetBase
      modal
      aria-label={label}
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      snapPointsMode="fit"
      unmountChildrenWhenHidden
    >
      <SheetBase.Overlay
        bg="shadow6"
        transition="quick"
        opacity="enter:0 exit:0"
      />
      <SheetBase.Handle bg="color8" />
      <SheetBase.Container ref={container} p={16} tabIndex={-1}>
        <SheetBase.Background
          bg="color2"
          borderTopLeftRadius={16}
          borderTopRightRadius={16}
        />
        <YStack gap={8}>{children}</YStack>
      </SheetBase.Container>
    </SheetBase>
  );
}
