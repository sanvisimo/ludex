import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  config,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  H3,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  ScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  TamaguiProvider,
  Text,
  Textarea,
  toast,
  Toaster,
  XStack,
  YStack,
} from '@repo/ui';
import { X } from '@repo/ui/icons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Lo scheletro di `apps/mobile`: una schermata sola con i quindici componenti
 * di `@repo/ui`.
 *
 * Non è l'app mobile, che viene dopo lo step 13. È la prova che il design
 * system universale gira davvero su un telefono: senza un secondo consumatore
 * i componenti "anche per mobile" non li aprirebbe mai nessuno. I casi che qui
 * cambiano davvero rispetto al web sono il Select, che al tocco diventa un
 * foglio dal basso, e i portali di dialogo, menu e toast.
 *
 * Il `TamaguiProvider` monta la stessa `config` di `apps/web`: un colore
 * cambiato in `packages/ui` cambia su entrambe.
 */
export function App() {
  const system = useColorScheme();
  const [dark, setDark] = useState(system === 'dark');

  return (
    // Il foglio dal basso del Select legge gli ingombri dello schermo (notch,
    // barra dei gesti) da `react-native-safe-area-context`, che vuole il suo
    // provider in cima all'albero.
    <SafeAreaProvider>
      <TamaguiProvider config={config} defaultTheme={dark ? 'dark' : 'light'}>
        <YStack flex={1} bg="$background">
          <ScrollView contentContainerStyle={{ p: 16, pt: 64 }}>
            <YStack gap={24}>
              <XStack items="center" justify="space-between">
                <H3>Ludex · design system</H3>
                <XStack items="center" gap={8}>
                  <Label htmlFor="tema">Scuro</Label>
                  <Switch id="tema" checked={dark} onCheckedChange={setDark} />
                </XStack>
              </XStack>

              <Section title="Button">
                <XStack flexWrap="wrap" gap={8}>
                  <Button>Default</Button>
                  <Button variant="outline">Outline</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="destructive">Destructive</Button>
                  <Button size="icon" variant="outline" aria-label="Chiudi">
                    <X size={16} />
                  </Button>
                </XStack>
              </Section>

              <Section title="Badge">
                <XStack flexWrap="wrap" gap={8}>
                  <Badge>Default</Badge>
                  <Badge variant="secondary">Espansione</Badge>
                  <Badge variant="outline">da rigiocare</Badge>
                </XStack>
              </Section>

              <Section title="Card">
                <Card>
                  <CardHeader>
                    <CardTitle>Nel tuo backlog</CardTitle>
                    <CardDescription>The Witcher 3: Wild Hunt</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Text color="$color11">52 h di storia</Text>
                  </CardContent>
                </Card>
              </Section>

              <Section title="Alert">
                <Alert variant="destructive">
                  <AlertTitle>Collegamento scaduto</AlertTitle>
                  <AlertDescription>
                    Ricollega l’account per riprendere le importazioni.
                  </AlertDescription>
                </Alert>
              </Section>

              <Section title="Skeleton">
                <Skeleton height={64} width="100%" rounded={12} />
              </Section>

              <Section title="Input, Textarea, InputGroup">
                <Input placeholder="Cerca un titolo" />
                <Textarea placeholder="Note" />
                <InputGroup>
                  <InputGroupInput placeholder="PlayStation 5" />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton aria-label="Svuota">
                      <X size={12} />
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Section>

              <Section title="Select">
                <StatusSelect />
              </Section>

              <Section title="Combobox">
                <PlatformCombobox />
              </Section>

              <Section title="Dialog">
                <Dialog>
                  <DialogTrigger render={<Button>Apri il dialogo</Button>} />
                  <DialogContent closeLabel="Chiudi">
                    <DialogHeader>
                      <DialogTitle>Aggiungi un gioco</DialogTitle>
                      <DialogDescription>
                        Cercalo su IGDB e scegli la piattaforma.
                      </DialogDescription>
                    </DialogHeader>
                    <Input placeholder="Hollow Knight" />
                    <DialogFooter>
                      <DialogClose
                        render={<Button variant="outline">Annulla</Button>}
                      />
                      <Button>Aggiungi</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </Section>

              <Section title="DropdownMenu">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="outline">Nascondi</Button>}
                  />
                  <DropdownMenuContent>
                    <DropdownMenuItem>App o servizio</DropdownMenuItem>
                    <DropdownMenuItem>DLC o espansione</DropdownMenuItem>
                    <DropdownMenuItem>Non mi interessa</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Section>

              <Section title="Toast">
                <Button
                  variant="outline"
                  onPress={() => toast.success('Modifiche salvate')}
                >
                  Mostra un toast
                </Button>
              </Section>
            </YStack>
          </ScrollView>
          <Toaster />
        </YStack>
      </TamaguiProvider>
    </SafeAreaProvider>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={12} fontWeight="600" color="$color11">
        {title.toUpperCase()}
      </Text>
      {children}
    </YStack>
  );
}

const statusLabels = {
  backlog: 'Da giocare',
  playing: 'In corso',
  played: 'Finito',
  dropped: 'Abbandonato',
};

function StatusSelect() {
  const [value, setValue] = useState('backlog');
  return (
    <Select items={statusLabels} value={value} onValueChange={setValue}>
      <SelectTrigger width="100%">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusLabels).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const platforms: Record<string, string> = {
  pc_windows: 'PC (Windows)',
  nintendo_switch: 'Nintendo Switch',
  sony_playstation4: 'PlayStation 4',
  sony_playstation5: 'PlayStation 5',
};

function PlatformCombobox() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <Combobox
      items={Object.keys(platforms)}
      value={value}
      onValueChange={setValue}
      itemToStringLabel={(slug) => platforms[slug] ?? slug}
    >
      <ComboboxInput placeholder="Scegli una piattaforma" width="100%" />
      <ComboboxContent>
        <ComboboxEmpty>Nessuna piattaforma</ComboboxEmpty>
        <ComboboxList>
          {(slug: string) => (
            <ComboboxItem key={slug} value={slug}>
              {platforms[slug]}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
