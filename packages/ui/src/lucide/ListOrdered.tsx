import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const ListOrdered: (props: IconProps) => JSX.Element = themed(
  memo(function ListOrdered(props: IconProps) {
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
        <Path d="M11 5h10" stroke={color} />
        <Path d="M11 12h10" stroke={color} />
        <Path d="M11 19h10" stroke={color} />
        <Path d="M4 4h1v5" stroke={color} />
        <Path d="M4 9h2" stroke={color} />
        <Path
          d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"
          stroke={color}
        />
      </Svg>
    );
  }),
);
