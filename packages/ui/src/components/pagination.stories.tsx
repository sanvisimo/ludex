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
    await expect(pageRange(1, 42)).toEqual([1, 2, null, 41, 42]);
    await expect(pageRange(20, 42)).toEqual([1, null, 19, 20, 21, null, 42]);
    await expect(pageRange(42, 42)).toEqual([1, 2, null, 41, 42]);
    // Un buco di una pagina sola si riempie con la pagina.
    await expect(pageRange(3, 42)).toEqual([1, 2, 3, 4, null, 42]);
    await expect(pageRange(2, 3)).toEqual([1, 2, 3]);
    await expect(pageRange(1, 1)).toEqual([1]);
    // Senza vicine, come su un telefono.
    await expect(pageRange(20, 42, 0)).toEqual([1, null, 20, null, 42]);
    await expect(pageRange(1, 42, 0)).toEqual([1, null, 42]);
    await expect(pageRange(4, 42, 0)).toEqual([1, null, 4, null, 42]);
    await expect(pageRange(3, 42, 0)).toEqual([1, 2, 3, null, 42]);
    await expect(pageRange(2, 3, 0)).toEqual([1, 2, 3]);
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
 * e ciò che non è un numero non fa niente. Il campo è la pagina aperta: dopo
 * Invio mostra il numero già tenuto fra 1 e l'ultima, o torna alla pagina
 * aperta se non era un numero.
 */
export const GoToClamps: Story = {
  ...GoTo,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Per ruolo e non per etichetta: i campi nel DOM sono due, uno per serie,
    // e il ruolo conta solo quello a vista.
    const field = canvas.getByRole('textbox', { name: 'Vai a pagina' });
    await expect(field).toHaveAttribute('aria-current', 'page');
    await expect(field).toHaveValue('20');

    await userEvent.clear(field);
    await userEvent.type(field, '999{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(42);
    await expect(field).toHaveValue('42');

    await userEvent.clear(field);
    await userEvent.type(field, '0{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(1);
    await expect(field).toHaveValue('1');

    await userEvent.clear(field);
    await userEvent.type(field, '7{Enter}');
    await expect(args.onGoTo).toHaveBeenLastCalledWith(7);

    await userEvent.clear(field);
    await userEvent.type(field, 'abc{Enter}');
    await expect(args.onGoTo).toHaveBeenCalledTimes(3);
    await expect(field).toHaveValue('20');
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

/**
 * Su un telefono le pagine vicine spariscono e la riga sta tutta su una
 * linea: `‹ 1 … 160 … 163 ›`, con la freccia avanti accanto alle altre e non
 * a capo. Vale sotto i 640 px: `mobile1` è largo 320.
 */
export const Phone: Story = {
  args: { page: 160, pageCount: 163, goToLabel: 'Vai a pagina', onGoTo: fn() },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole('navigation', {
      name: 'Pagine',
    });
    await expect(within(nav).queryByRole('link', { name: '159' })).toBeNull();
    await expect(within(nav).queryByRole('link', { name: '161' })).toBeNull();
    const first = within(nav).getByRole('link', { name: '1' });
    const next = within(nav).getByRole('link', { name: 'Successiva' });
    await expect(next.getBoundingClientRect().top).toBe(
      first.getBoundingClientRect().top,
    );
  },
};
