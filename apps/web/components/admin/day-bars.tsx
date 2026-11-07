import { Text, YStack } from '@repo/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useFormatter } from 'use-intl';

type DayCount = { day: string; count: number };

/**
 * Un conteggio al giorno, a barre: le iscrizioni e i giochi nuovi della
 * sezione Uso (plans/admin-uso.md). Recharts sta solo nel web: l'admin non
 * esiste su mobile, e `packages/ui` resta universale.
 *
 * Una serie sola, quindi niente legenda: la dice il titolo. I colori sono le
 * variabili del tema, così chiaro e scuro vengono da sé; il testo usa i
 * colori del testo, mai quello della barra.
 */
export function DayBars({
  title,
  data,
  valueLabel,
}: {
  title: string;
  data: DayCount[];
  /** «3 iscrizioni»: il numero nel tooltip, con la sua unità. */
  valueLabel: (count: number) => string;
}) {
  const format = useFormatter();
  // Il giorno è UTC, com'è contato sul server: col fuso di chi guarda la
  // barra di mezzanotte finirebbe sul giorno prima.
  const day = (value: string, long = false) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), {
      day: 'numeric',
      month: long ? 'long' : 'numeric',
      timeZone: 'UTC',
    });
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <YStack
      gap={12}
      p={16}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
    >
      <Text fontSize={14} lineHeight={20} fontWeight="600">
        {title}
      </Text>
      <YStack
        height={180}
        role="img"
        aria-label={`${title}: ${valueLabel(total)}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
          >
            <CartesianGrid vertical={false} stroke="var(--borderColor)" />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => day(value)}
              tickLine={false}
              axisLine={{ stroke: 'var(--borderColor)' }}
              minTickGap={24}
              tick={{ fill: 'var(--color11)', fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              width={40}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color11)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'var(--color3)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as DayCount | undefined;
                if (!active || !point) return null;
                return (
                  <YStack
                    px={10}
                    py={6}
                    rounded={8}
                    borderWidth={1}
                    borderColor="$borderColor"
                    bg="$background"
                  >
                    <Text fontSize={12} lineHeight={16} color="$color11">
                      {day(point.day, true)}
                    </Text>
                    <Text fontSize={13} lineHeight={18} fontWeight="600">
                      {valueLabel(point.count)}
                    </Text>
                  </YStack>
                );
              }}
            />
            <Bar
              dataKey="count"
              fill="var(--accent9)"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </YStack>
    </YStack>
  );
}
