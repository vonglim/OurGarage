import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeMarketing() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Neighborly Way to Build</Text>
      <Text style={styles.subtitle}>
        Skip the rental shop and connect with people right in your neighborhood.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verified Trust</Text>
        <Text style={styles.sectionText}>
          Build confidence with user profiles, ratings, and optional verification as our community grows.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Save & Earn</Text>
        <Text style={styles.sectionText}>
          Rent for up to 40% less than big retailers, or turn your garage into a profit center.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sustainable Community</Text>
        <Text style={styles.sectionText}>
          Sharing means fewer new products and a smaller environmental footprint.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
});