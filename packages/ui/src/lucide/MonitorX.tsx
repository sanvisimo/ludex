import { memo, type JSX } from 'react';
import { Svg, Path, Rect, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const MonitorX: (props: IconProps) => JSX.Element = themed(
  memo(function MonitorX(props: IconProps) {
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
        <Path d="m14.5 12.5-5-5" stroke={color} />
        <Path d="m9.5 12.5 5-5" stroke={color} />
        <Rect width="20" height="14" x="2" y="3" rx="2" stroke={color} />
        <Path d="M12 17v4" stroke={color} />
        <Path d="M8 21h8" stroke={color} />
      </Svg>
    );
  }),
);
