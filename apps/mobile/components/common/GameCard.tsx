import React from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { GV_DARK, GV_CARD, GV_EMERALD, statusColors, coverUrl, timeAgo } from '../../constants/theme';

const { width } = Dimensions.get('window');
export const GRID_ITEM_W = (width - 48 - 12) / 3;

interface GameCardProps {
  item: {
    id: string;
    status: string;
    created_at: string;
    games?: { title?: string; cover_url?: string };
  };
}

export function GameCard({ item }: GameCardProps) {
  return (
    <View style={styles.gridItem}>
      <View style={styles.coverWrap}>
        <Image
          source={{ uri: coverUrl(item.games?.cover_url) }}
          style={styles.cover}
        />
        <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] || GV_EMERALD }]} />
      </View>
      <Text style={styles.gameTitle} numberOfLines={2}>
        {item.games?.title || 'Desconocido'}
      </Text>
      <Text style={styles.gameDate}>{timeAgo(item.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gridItem: { width: GRID_ITEM_W },
  coverWrap: { position: 'relative', marginBottom: 8 },
  cover: {
    width: GRID_ITEM_W,
    height: GRID_ITEM_W * (4 / 3),
    borderRadius: 12,
    backgroundColor: GV_CARD,
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: GV_DARK,
  },
  gameTitle: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  gameDate: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 },
});
