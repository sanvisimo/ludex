import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const FlaskConical: (props: IconProps) => JSX.Element = themed(
  memo(function FlaskConical(props: IconProps) {
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
          d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2"
          stroke={color}
        />
        <Path d="M6.453 15h11.094" stroke={color} />
        <Path d="M8.5 2h7" stroke={color} />
      </Svg>
    );
  }),
);
