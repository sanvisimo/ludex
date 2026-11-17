import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const SlidersHorizontal: (props: IconProps) => JSX.Element = themed(
  memo(function SlidersHorizontal(props: IconProps) {
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
        <Path d="M10 5H3" stroke={color} />
        <Path d="M12 19H3" stroke={color} />
        <Path d="M14 3v4" stroke={color} />
        <Path d="M16 17v4" stroke={color} />
        <Path d="M21 12h-9" stroke={color} />
        <Path d="M21 19h-5" stroke={color} />
        <Path d="M21 5h-7" stroke={color} />
        <Path d="M8 10v4" stroke={color} />
        <Path d="M8 12H3" stroke={color} />
      </Svg>
    );
  }),
);
