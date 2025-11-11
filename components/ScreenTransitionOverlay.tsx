import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet } from "react-native";
import LottieView from "lottie-react-native";

type Props = {
  visible: boolean;
  onFinished?: () => void;
  speed?: number; // 1.0 = normal; yo uso 1.6 para ~700ms
};

export default function ScreenTransitionOverlay({ visible, onFinished, speed = 1.6 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const animRef = useRef<LottieView>(null);

  useEffect(() => {
    if (visible) {
      animRef.current?.reset();
      animRef.current?.play();
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, styles.overlay, { opacity, zIndex: 9999 }]}
    >
      {visible ? (
        <LottieView
          ref={animRef}
          source={require("@/assets/lottie/Poker-Chip-Shuffle.json")}
          autoPlay
          loop={false}
          speed={speed}
          // Android rinde mejor con HARDWARE
          renderMode={Platform.OS === "android" ? "HARDWARE" : "AUTOMATIC"}
          onAnimationFinish={onFinished}
          style={{ width: 140, height: 140 }}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(11,15,18,0.55)", // tu tema
  },
});
