import { Tabs } from "expo-router";
import React from "react";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";

const GV_EMERALD = "#10b981";
const GV_SURFACE = "#080f1e";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: GV_EMERALD,
        tabBarInactiveTintColor: "rgba(255,255,255,0.3)",
        tabBarStyle: {
          backgroundColor: GV_SURFACE,
          borderTopColor: "rgba(255,255,255,0.06)",
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 14,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Escáner",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="camera.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="message.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: "Mi Perfil",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
