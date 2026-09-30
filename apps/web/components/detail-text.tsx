import { Text, styled } from '@repo/ui';

/**
 * I tre testi delle sezioni di dettaglio della pagina del gioco: il titolo
 * della sezione, il testo secondario e il valore in evidenza. Prima erano
 * classi di Tailwind ripetute in ogni riga.
 */
export const DetailTitle = styled(Text, {
  render: 'h3',
  fontFamily: '$heading',
  fontSize: 15,
  lineHeight: 20,
  fontWeight: '600',
  color: '$color12',
  m: 0,
});

export const Muted = styled(Text, {
  fontSize: 14,
  lineHeight: 20,
  color: '$color11',
  m: 0,
});

export const Strong = styled(Text, {
  fontSize: 14,
  lineHeight: 20,
  fontWeight: '600',
  color: '$color12',
  m: 0,
});
