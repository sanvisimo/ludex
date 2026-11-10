import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { YStack } from '../primitives';
import { Gallery, type GalleryItem } from './gallery';

// Immagini disegnate qui e non prese dalla rete: i test girano senza, e un
// colore per immagine basta a vedere quale è scelta.
function tinta(color: string, text: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="${color}"/><text x="640" y="380" font-size="96" text-anchor="middle" fill="white">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const immagini: GalleryItem[] = [
  '#12a594',
  '#8e4ec6',
  '#e5484d',
  '#ffb224',
].map((color, i) => ({
  kind: 'image',
  src: tinta(color, `Screenshot ${i + 1}`),
  thumb: tinta(color, `${i + 1}`),
  alt: `Screenshot ${i + 1}`,
}));

const tanteImmagini: GalleryItem[] = Array.from({ length: 12 }, (_, i) => ({
  kind: 'image',
  src: tinta('#12a594', `Screenshot ${i + 1}`),
  thumb: tinta('#12a594', `${i + 1}`),
  alt: `Screenshot ${i + 1}`,
}));

// L'elemento che scorre davvero: dentro `ScrollView` c'è un contenitore largo
// quanto tutte le miniature.
function filaDi(miniatura: HTMLElement) {
  let fila = miniatura.parentElement!;
  while (getComputedStyle(fila).overflowX === 'visible') {
    fila = fila.parentElement!;
  }
  return fila;
}

const labels = {
  previous: 'Precedente',
  next: 'Successiva',
  play: 'Guarda',
  enlarge: 'Ingrandisci',
  close: 'Chiudi',
  item: (index: number, total: number) => `Elemento ${index} di ${total}`,
};

const meta = {
  title: 'Components/Gallery',
  component: Gallery,
  args: { items: immagini, labels },
  decorators: [
    (Story) => (
      <YStack width={640} maxW="100%">
        <Story />
      </YStack>
    ),
  ],
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Frecce e miniature scelgono la stessa cosa; agli estremi le frecce si spengono. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const precedente = canvas.getByRole('button', { name: 'Precedente' });
    const successiva = canvas.getByRole('button', { name: 'Successiva' });

    // Il nostro `Button` spento resta nel tab e lo dice con `aria-disabled`.
    await expect(precedente).toHaveAttribute('aria-disabled', 'true');
    await expect(
      canvas.getByRole('button', { name: 'Elemento 1 di 4' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Elemento 4 di 4' }),
    );
    await expect(successiva).toHaveAttribute('aria-disabled', 'true');
    await expect(
      canvas.getByRole('button', { name: 'Ingrandisci: Screenshot 4' }),
    ).toBeInTheDocument();

    await userEvent.click(precedente);
    await expect(
      canvas.getByRole('button', { name: 'Elemento 3 di 4' }),
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Con le frecce la miniatura scelta entra in vista, anche se la fila non ci sta. */
export const ManyThumbnails: Story = {
  args: { items: tanteImmagini },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const successiva = canvas.getByRole('button', { name: 'Successiva' });
    const ultima = canvas.getByRole('button', { name: 'Elemento 12 di 12' });
    const fila = filaDi(ultima);

    const inVista = (item: HTMLElement) => {
      const viewport = fila.getBoundingClientRect();
      const left = viewport.left + fila.clientLeft;
      const box = item.getBoundingClientRect();
      return box.left >= left - 1 && box.right <= left + fila.clientWidth + 1;
    };

    await expect(inVista(ultima)).toBe(false);
    for (let i = 0; i < 11; i++) await userEvent.click(successiva);
    await expect(ultima).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(inVista(ultima)).toBe(true));

    const precedente = canvas.getByRole('button', { name: 'Precedente' });
    const prima = canvas.getByRole('button', { name: 'Elemento 1 di 12' });
    for (let i = 0; i < 11; i++) await userEvent.click(precedente);
    await expect(prima).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(inVista(prima)).toBe(true));
  },
};

/** Col mouse la fila si trascina, e rilasciarla non sceglie la miniatura sotto. */
export const DragThumbnails: Story = {
  args: { items: tanteImmagini },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const prima = canvas.getByRole('button', { name: 'Elemento 1 di 12' });
    const seconda = canvas.getByRole('button', { name: 'Elemento 2 di 12' });
    const fila = filaDi(prima);
    const { left, top, width, height } = seconda.getBoundingClientRect();
    const clientX = left + width / 2;
    const clientY = top + height / 2;

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: seconda, coords: { clientX, clientY } },
      { target: seconda, coords: { clientX: clientX - 100, clientY } },
      { keys: '[/MouseLeft]', target: seconda },
    ]);
    await expect(fila.scrollLeft).toBe(100);
    await expect(prima).toHaveAttribute('aria-pressed', 'true');

    // Il clic che segue è di nuovo un clic.
    await userEvent.click(seconda);
    await expect(seconda).toHaveAttribute('aria-pressed', 'true');
  },
};

/** L'immagine si apre a tutto schermo, in un dialogo che porta il suo nome. */
export const Enlarge: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Ingrandisci: Screenshot 1' }),
    );
    // Il pannello sta in un portale, fuori dal canvas; lo si cerca per nome,
    // che è il titolo del dialogo.
    const dialogo = await screen.findByRole('dialog', { name: 'Screenshot 1' });
    await waitFor(() => expect(dialogo).toBeVisible());
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Screenshot 1' })).toBeNull(),
    );
  },
};

/**
 * Il trailer in testa: finché non si preme «play» è una miniatura, e
 * l'`iframe` di YouTube non c'è — la pagina non ne carica gli script.
 */
export const WithVideo: Story = {
  args: {
    items: [
      { kind: 'video', videoId: 'dQw4w9WgXcQ', title: 'Trailer' },
      ...immagini,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('iframe')).toBeNull();

    await userEvent.click(
      canvas.getByRole('button', { name: 'Guarda: Trailer' }),
    );

    const iframe = canvasElement.querySelector('iframe');
    await expect(iframe).toHaveAttribute('title', 'Trailer');
    await expect(iframe?.getAttribute('src')).toContain(
      'youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  },
};

/** Un elemento solo: niente frecce né miniature. */
export const Single: Story = {
  args: { items: immagini.slice(0, 1) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole('button', { name: 'Successiva' }),
    ).toBeNull();
  },
};
