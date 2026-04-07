import { RefObject, useLayoutEffect, useState } from "react";
import { Size2D } from "../math/matrix2d";

const EMPTY_SIZE: Size2D = { width: 0, height: 0 };

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>
): Size2D {
  const [size, setSize] = useState<Size2D>(EMPTY_SIZE);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      const nextSize = {
        width: element.clientWidth,
        height: element.clientHeight,
      };

      setSize((previousSize) =>
        previousSize.width === nextSize.width &&
        previousSize.height === nextSize.height
          ? previousSize
          : nextSize
      );
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}
