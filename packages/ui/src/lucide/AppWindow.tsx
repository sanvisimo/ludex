import { memo, type JSX } from 'react';
import { Svg, Path, Rect, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const AppWindow: (props: IconProps) => JSX.Element = themed(
  memo(function AppWindow(props: IconProps) {
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
        <Rect x="2" y="4" width="20" height="16" rx="2" stroke={color} />
        <Path d="M10 4v4" stroke={color} />
        <Path d="M2 8h20" stroke={color} />
        <Path d="M6 4v4" stroke={color} />
      </Svg>
    );
  }),
);
