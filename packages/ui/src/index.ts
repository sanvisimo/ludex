/**
 * Il design system, **universale**: gli stessi componenti per `apps/web` e
 * `apps/mobile`.
 *
 * Regola di confine, e non è una formalità: qui dentro non entrano né il
 * router del web (`@tanstack/react-router`, `@tanstack/react-start`), né
 * `@repo/contracts`, né `@repo/db`. Un componente che conoscesse il tipo
 * `BacklogEntry` smetterebbe di essere un pezzo di design system e
 * diventerebbe una schermata — e su React Native un import del router del web
 * romperebbe il bundle.
 *
 * **Niente `export * from 'tamagui'`**, ed è una scelta e non una dimenticanza:
 * Tamagui esporta `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`,
 * `Switch` e `TextArea`, cioè otto dei nostri quindici nomi. Con l'export
 * generico `@repo/ui` ne esporterebbe due per ciascuno e a vincere sarebbe
 * l'ultima riga del file — un modo eccellente di usare per mesi un componente
 * diverso da quello che si crede. Qui si esporta **un** `Button`: il nostro.
 * Chi ha bisogno del pezzo grezzo lo importa da `tamagui` *dentro* questo
 * package, mai dalle app.
 */

// I primitivi di Tamagui che le app usano così come sono.
export * from './primitives';

// I nostri componenti.
export {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  type AccordionProps,
} from './components/accordion';
export {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertProps,
} from './components/alert';
export { Avatar, initials, type AvatarProps } from './components/avatar';
export { Badge, type BadgeProps } from './components/badge';
export { Button, type ButtonProps } from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type CardProps,
} from './components/card';
export { Checkbox, type CheckboxProps } from './components/checkbox';
export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  type ComboboxInputProps,
  type ComboboxProps,
} from './components/combobox';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogContentProps,
  type DialogProps,
} from './components/dialog';
export { Drawer, type DrawerProps } from './components/drawer';
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  type DropdownMenuContentProps,
  type DropdownMenuItemProps,
  type DropdownMenuProps,
} from './components/dropdown-menu';
export { EmptyState, type EmptyStateProps } from './components/empty-state';
export { Input, type InputProps } from './components/input';
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  type InputGroupProps,
} from './components/input-group';
export {
  BrandIcon,
  brandTitle,
  brandValues,
  type Brand,
  type BrandIconProps,
} from './components/brand-icon';
export {
  Gallery,
  type GalleryItem,
  type GalleryProps,
} from './components/gallery';
export { Label, type LabelProps } from './components/label';
export {
  Logo,
  Wordmark,
  type LogoProps,
  type WordmarkProps,
} from './components/logo';
export { NavItem, type NavItemProps } from './components/nav-item';
export {
  Pagination,
  pageRange,
  type PaginationProps,
} from './components/pagination';
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectProps,
} from './components/select';
export { Sheet, type SheetProps } from './components/sheet';
export { Skeleton, type SkeletonProps } from './components/skeleton';
export { Slider, type SliderProps } from './components/slider';
export { Switch, type SwitchProps } from './components/switch';
export { Toaster, toast, type ToasterProps } from './components/toast';
export { Textarea, type TextareaProps } from './components/textarea';
export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
} from './components/toggle-group';
export { Tooltip, type TooltipProps } from './components/tooltip';

// Le icone stanno in `@repo/ui/icons`, non qui: sono oltre millecinquecento
// nomi e affogherebbero i componenti nell'autocompletamento.

// Token, temi e configurazione.
export { config } from './config';
export type { AppConfig } from './config';
export { themes } from './themes';
export { accents, defaultAccent, base, states } from './palettes';
export type { Accent } from './palettes';
export {
  YoutubeVideo,
  youtubeThumbnail,
  type YoutubeVideoProps,
} from './components/youtube-video';
