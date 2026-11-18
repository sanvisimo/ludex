import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Trophy: (props: IconProps) => JSX.Element = themed(
  memo(function Trophy(props: IconProps) {
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
        <Path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" stroke={color} />
        <Path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2" stroke={color} />
        <Path
          d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"
          stroke={color}
        />
        <Path d="M4 22h16" stroke={color} />
        <Path
          d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"
          stroke={color}
        />
        <Path
          d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"
          stroke={color}
        />
      </Svg>
    );
  }),
);
