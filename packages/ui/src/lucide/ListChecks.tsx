import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const ListChecks: (props: IconProps) => JSX.Element = themed(
  memo(function ListChecks(props: IconProps) {
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
        <Path d="M13 5h8" stroke={color} />
        <Path d="M13 12h8" stroke={color} />
        <Path d="M13 19h8" stroke={color} />
        <Path d="m3 17 2 2 4-4" stroke={color} />
        <Path d="m3 7 2 2 4-4" stroke={color} />
      </Svg>
    );
  }),
);
