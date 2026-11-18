import { memo, type JSX } from 'react';
import { Svg, Path, Rect, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Rows3: (props: IconProps) => JSX.Element = themed(
  memo(function Rows3(props: IconProps) {
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
        <Rect width="18" height="18" x="3" y="3" rx="2" stroke={color} />
        <Path d="M21 9H3" stroke={color} />
        <Path d="M21 15H3" stroke={color} />
      </Svg>
    );
  }),
);
