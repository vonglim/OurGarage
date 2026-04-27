import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const HomeMarketing = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>The Neighborly Way to Build</Text>
      <Text style={styles.subtitle}>
        Skip the rental shop and connect with people right in your neighborhood.
      </Text>
      
      <View style={styles.featureContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔒</Text>
        </View>
        <Text style={styles.featureTitle}>Verified Trust</Text>
        <Text style={styles.featureDescription}>
          Build confidence with user profiles, ratings, and optional verification as our community grows.
        </Text>
      </View>
      
      <View style={styles.featureContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>💰</Text>
        </View>
        <Text style={styles.featureTitle}>Save & Earn</Text>
        <Text style={styles.featureDescription}>
          Rent for up to 40% less than big retailers, or turn your garage into a profit center.
        </Text>
      </View>
      
      <View style={styles.featureContainer}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🌱</Text>
        </View>
        <Text style={styles.featureTitle}>Sustainable Community</Text>
        <Text style={styles.featureDescription}>
          Sharing means fewer new products and a smaller environmental footprint.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    color: '#666',
  },
  featureContainer: {
    width: '100%',
    marginBottom: 30,
    alignItems: 'center',
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  icon: {
    fontSize: 30,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  featureDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    lineHeight: 22,
  },
});

export default HomeMarketing;