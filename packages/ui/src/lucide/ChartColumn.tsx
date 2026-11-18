import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const ChartColumn: (props: IconProps) => JSX.Element = themed(
  memo(function ChartColumn(props: IconProps) {
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
        <Path d="M3 3v16a2 2 0 0 0 2 2h16" stroke={color} />
        <Path d="M18 17V9" stroke={color} />
        <Path d="M13 17V5" stroke={color} />
        <Path d="M8 17v-3" stroke={color} />
      </Svg>
    );
  }),
);
