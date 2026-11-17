import { memo, type JSX } from 'react';
import { Svg, Circle, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const KeyRound: (props: IconProps) => JSX.Element = themed(
  memo(function KeyRound(props: IconProps) {
    const {
      color = 'black',
      size = 24,
      ...otherProps
    } = props as SvgProps & {
      color?: string;
      size?: number;
    };
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...otherProps}
      >
        <Path
          d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
          stroke={color}
        />
        <Circle cx="16.5" cy="7.5" r=".5" fill={color} stroke={color} />
      </Svg>
    );
  }),
);
