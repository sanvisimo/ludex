import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Pagination, pageRange, type PaginationProps } from './pagination';

const meta: Meta<PaginationProps> = {
  title: 'Components/Pagination',
  component: Pagination,
  args: {
    page: 1,
    pageCount: 42,
    href: (page) => `?page=${page}`,
    label: 'Pagine',
    previousLabel: 'Precedente',
    nextLabel: 'Successiva',
    onNavigate: fn(),
  },
};

export default meta;
type Story = StoryObj<PaginationProps>;

/** La prima pagina: la freccia indietro c'è ma è spenta. */
export const First: Story = {};

/** In mezzo: la prima, l'ultima, e la aperta con le due vicine. */
export const Middle: Story = { args: { page: 20 } };

export const Last: Story = { args: { page: 42 } };

/** Poche pagine: tutte a vista, niente «…». */
export const Few: Story = { args: { page: 2, pageCount: 4 } };

/** I conti dei buchi, che sono la parte che si scrive storta. */
export const Range: Story = {
  args: { page: 3, pageCount: 42 },
  play: async () => {
    await expect(pageRange(1, 42)).toEqual([1, 2, null, 42]);
    await expect(pageRange(20, 42)).toEqual([1, null, 19, 20, 21, null, 42]);
    // Un buco di una pagina sola si riempie con la pagina.
    await expect(pageRange(3, 42)).toEqual([1, 2, 3, 4, null, 42]);
    await expect(pageRange(2, 3)).toEqual([1, 2, 3]);
    await expect(pageRange(1, 1)).toEqual([1]);
  },
};

function Stateful(args: PaginationProps) {
  const [page, setPage] = useState(1);
  return (
    <Pagination
      {...args}
      page={page}
      onNavigate={(target, event) => {
        (event as Event).preventDefault();
        setPage(target);
        args.onNavigate?.(target, event);
      }}
    />
  );
}

/**
 * Le pagine sono link veri, la aperta porta `aria-current`, e il clic passa
 * all'app la pagina scelta — è lì che il router si prende la navigazione.
 */
export const Navigate: Story = {
  render: (args) => <Stateful {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole('navigation', { name: 'Pagine' });
    const current = within(nav).getByRole('link', { name: '1' });
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(current).toHaveAttribute('href', '?page=1');

    await userEvent.click(
      within(nav).getByRole('link', { name: /Successiva/ }),
    );
    await expect(args.onNavigate).toHaveBeenLastCalledWith(
      2,
      expect.anything(),
    );
    await expect(within(nav).getByRole('link', { name: '2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  },
};

/** Con una pagina sola non c'è niente da disegnare. */
export const Single: Story = {
  args: { pageCount: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('navigation')).toBeNull();
  },
};

/** Con «vai a pagina»: il campo dopo le frecce. */
export const GoTo: Story = {
  args: { page: 20, goToLabel: 'Vai a pagina', onGoTo: fn() },
};

/**
 * Un numero e Invio: oltre l'ultima va all'ultima, sotto la prima alla prima,
 * e ciò che non è un numero non fa niente. Dopo il salto il campo si svuota.
 */
export const GoToClamps: Story = {
  ...GoTo,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText('Vai a pagina');

    await userEvent.type(field, '999{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(42);
    await expect(field).toHaveValue('');

    await userEvent.type(field, '0{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(1);

    await userEvent.type(field, '7{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(7);

    await userEvent.type(field, 'abc{Enter}');
    await expect(args.onGoTo).toHaveBeenCalledTimes(3);
  },
};

/** Le frecce non hanno testo a vista: il nome sta in `aria-label`. */
export const ArrowNames: Story = {
  args: { page: 20 },
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', {
      name: 'Pagine',
    });
    await expect(
      within(nav).getByRole('link', { name: 'Precedente' }),
    ).toHaveAttribute('href', '?page=19');
    await expect(
      within(nav).getByRole('link', { name: 'Successiva' }),
    ).toHaveAttribute('href', '?page=21');
    await expect(within(nav).queryByText('Precedente')).toBeNull();
  },
};
