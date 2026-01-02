import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, UrlTile } from 'react-native-maps';

// --- AYARLAR ---
const MAPBOX_API_KEY = "pk.eyJ1IjoiZW5lc2d1bGVyMTkzNCIsImEiOiJjbWh6Znp6aHAwbm04MmtzY3Q4cnpmOThjIn0.N8SgcYPoGe3DGG0oFuCg-Q";
const OWM_API_KEY = "8c9092e65b089840664b97ceb6c88ab4"; 

export default function App() {
  const [region, setRegion] = useState({
    latitude: 39.0, longitude: 35.0, 
    latitudeDelta: 10.0, longitudeDelta: 10.0,
  });
  
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [showRadar, setShowRadar] = useState(true);

  const [coords, setCoords] = useState<any>({ start: null, end: null });
  const [routeCoords, setRouteCoords] = useState<any[]>([]); 
  const [weatherMarkers, setWeatherMarkers] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(false);

  // --- Yardımcı: Mesafe Hesapla ---
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    var R = 6371; 
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
  };
  const deg2rad = (deg: number) => deg * (Math.PI / 180);

  // --- Yardımcı: İkon ve Renk Seçici (En Önemli Kısım) ---
  const getWeatherStyle = (main: string) => {
    switch(main) {
        case 'Clear': return { icon: 'weather-sunny', color: '#FFB300' }; // Koyu Sarı (Güneş)
        case 'Clouds': return { icon: 'weather-cloudy', color: '#78909C' }; // Gri Mavi (Bulut)
        case 'Rain': return { icon: 'weather-rainy', color: '#29B6F6' }; // Parlak Mavi (Yağmur)
        case 'Snow': return { icon: 'weather-snowy', color: '#00B0FF' }; // Buz Mavisi (Kar)
        case 'Thunderstorm': return { icon: 'weather-lightning', color: '#FDD835' }; // Sarı (Şimşek)
        case 'Drizzle': return { icon: 'weather-partly-rainy', color: '#4FC3F7' }; 
        case 'Mist': 
        case 'Fog': return { icon: 'weather-fog', color: '#B0BEC5' };
        default: return { icon: 'weather-partly-cloudy', color: '#90A4AE' };
    }
  };

  const getCoordinates = async (cityName: string) => {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityName)}.json?access_token=${MAPBOX_API_KEY}&limit=1`;
      const response = await axios.get(url);
      if (response.data.features.length > 0) {
        const [lon, lat] = response.data.features[0].center;
        return { latitude: lat, longitude: lon };
      }
      return null;
    } catch (error) { return null; }
  };

  const fetchWeatherForPoint = async (lat: number, lon: number) => {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=tr&appid=${OWM_API_KEY}`;
      const response = await axios.get(url);
      
      // Havaya göre stil seç (İkon adı ve Rengi)
      const style = getWeatherStyle(response.data.weather[0].main);

      return {
        temp: Math.round(response.data.main.temp),
        icon: style.icon,     // Örn: 'weather-sunny'
        iconColor: style.color, // Örn: '#FFB300'
        windSpeed: Math.round(response.data.wind.speed * 3.6),
        windDeg: response.data.wind.deg
      };
    } catch (error) { return null; }
  };

  const handleSearch = async () => {
    if (!origin || !destination) { Alert.alert("Hata", "Şehir giriniz."); return; }
    setIsLoading(true);
    setRouteCoords([]); 
    setWeatherMarkers([]);

    const startCoords = await getCoordinates(origin);
    const endCoords = await getCoordinates(destination);

    if (!startCoords || !endCoords) {
      setIsLoading(false); Alert.alert("Hata", "Şehir bulunamadı."); return;
    }

    setCoords({ start: startCoords, end: endCoords });
    setRegion({ 
        latitude: (startCoords.latitude + endCoords.latitude) / 2,
        longitude: (startCoords.longitude + endCoords.longitude) / 2,
        latitudeDelta: Math.abs(startCoords.latitude - endCoords.latitude) * 1.5,
        longitudeDelta: Math.abs(startCoords.longitude - endCoords.longitude) * 1.5,
    });

    try {
      let apiUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords.longitude},${startCoords.latitude};${endCoords.longitude},${endCoords.latitude}?geometries=geojson&access_token=${MAPBOX_API_KEY}`;
      if (avoidTolls) apiUrl += "&exclude=toll";

      const response = await axios.get(apiUrl);
      
      if (response.data.routes.length > 0) {
        const coordinates = response.data.routes[0].geometry.coordinates;
        const points = coordinates.map((point: any) => ({ latitude: point[1], longitude: point[0] }));
        setRouteCoords(points);

        const allMarkers = [];

        // 1. BAŞLANGIÇ
        const startWeather = await fetchWeatherForPoint(coordinates[0][1], coordinates[0][0]);
        if (startWeather) allMarkers.push({ latitude: coordinates[0][1], longitude: coordinates[0][0], ...startWeather });

        // 2. ARA NOKTALAR (60 KM)
        let accumulatedDistance = 0;
        let nextTarget = 60; 

        for (let i = 0; i < coordinates.length - 1; i++) {
            const lat1 = coordinates[i][1];
            const lon1 = coordinates[i][0];
            const lat2 = coordinates[i+1][1];
            const lon2 = coordinates[i+1][0];

            accumulatedDistance += getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2);

            if (accumulatedDistance >= nextTarget) {
                const distToEnd = getDistanceFromLatLonInKm(lat2, lon2, coordinates[coordinates.length-1][1], coordinates[coordinates.length-1][0]);
                if (distToEnd > 20) { 
                    const weather = await fetchWeatherForPoint(lat2, lon2);
                    if (weather) allMarkers.push({ latitude: lat2, longitude: lon2, ...weather });
                }
                nextTarget += 60;
            }
        }

        // 3. BİTİŞ
        const endWeather = await fetchWeatherForPoint(coordinates[coordinates.length-1][1], coordinates[coordinates.length-1][0]);
        if (endWeather) allMarkers.push({ latitude: coordinates[coordinates.length-1][1], longitude: coordinates[coordinates.length-1][0], ...endWeather });

        setWeatherMarkers(allMarkers);

      } else { Alert.alert("Uyarı", "Yol bulunamadı."); }
    } catch (error) { Alert.alert("Hata", "Bağlantı sorunu."); } finally { setIsLoading(false); }
  };

  return (
    <View style={styles.container}>
      
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={region}
        onRegionChangeComplete={setRegion} 
      >
        {showRadar && (
            <UrlTile
                urlTemplate={`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${OWM_API_KEY}`}
                zIndex={1} opacity={0.6}
            />
        )}
        
        {coords.start && <Marker coordinate={coords.start} title={origin} pinColor="green" />}
        {coords.end && <Marker coordinate={coords.end} title={destination} />}
        
        {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeColor="#0066FF" strokeWidth={5} />}

        {/* --- BEYAZ KULE (RENKLİ İKONLU) --- */}
        {weatherMarkers.map((marker, index) => (
            <Marker 
                key={index} 
                coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
                anchor={{ x: 0.5, y: 1 }}
            >
                <View style={styles.whiteTowerCard}>
                    {/* DERECE */}
                    <Text style={styles.towerTemp}>{marker.temp}°</Text>
                    
                    {/* RENKLİ VEKTÖR İKON (GARANTİLİ GÖRÜNÜR) */}
                    <MaterialCommunityIcons 
                        name={marker.icon} 
                        size={32} 
                        color={marker.iconColor} 
                        style={{ marginTop: -2, marginBottom: -2 }}
                    />
                    
                    {/* RÜZGAR */}
                    <View style={styles.towerWindRow}>
                        <View style={{transform: [{ rotate: `${marker.windDeg}deg` }]}}>
                            <MaterialCommunityIcons name="arrow-up" size={14} color="#555" />
                        </View>
                        <Text style={styles.towerWindText}>{marker.windSpeed}</Text>
                    </View>
                </View>
                <View style={styles.triangle} />
            </Marker>
        ))}
        {/* ---------------------------------- */}

      </MapView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.floatingPanel}>
        <View style={styles.panelContent}>
          <Text style={styles.panelTitle}>V2 Rota Analiz</Text>
          
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="truck-fast" size={26} color="#000" />
            <TextInput style={styles.input} placeholder="Nereden?" placeholderTextColor="#444" value={origin} onChangeText={setOrigin} />
          </View>

          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="map-marker-check" size={26} color="#000" />
            <TextInput style={styles.input} placeholder="Nereye?" placeholderTextColor="#444" value={destination} onChangeText={setDestination} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Paralı Yolları Kapat</Text>
            <Switch
              trackColor={{ false: "#767577", true: "#81b0ff" }}
              thumbColor={avoidTolls ? "#0066FF" : "#f4f3f4"}
              onValueChange={() => setAvoidTolls(!avoidTolls)}
              value={avoidTolls}
            />
          </View>
          
          <View style={styles.switchRow}>
            <Text style={[styles.switchText, {color: '#E65100'}]}>Canlı Radar</Text>
            <Switch
              trackColor={{ false: "#767577", true: "#FF9800" }}
              thumbColor={showRadar ? "#FF5722" : "#f4f3f4"}
              onValueChange={() => setShowRadar(!showRadar)}
              value={showRadar}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSearch} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" size="large" /> : <Text style={styles.buttonText}>ANALİZ ET ➔</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  
  whiteTowerCard: {
      backgroundColor: 'white',
      borderRadius: 15,
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: 2,
      width: 50,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 6,
      borderWidth: 1,
      borderColor: '#eee'
  },
  towerTemp: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#000',
  },
  towerWindRow: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  towerWindText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#555',
      marginLeft: 2
  },
  triangle: {
      width: 0,
      height: 0,
      backgroundColor: 'transparent',
      borderStyle: 'solid',
      borderLeftWidth: 6,
      borderRightWidth: 6,
      borderBottomWidth: 0,
      borderTopWidth: 8,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: 'white',
      alignSelf: 'center',
      marginTop: -1,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 1,
      elevation: 5
  },
  floatingPanel: { position: 'absolute', top: 50, left: 15, right: 15, backgroundColor: 'transparent' },
  panelContent: { backgroundColor: 'white', borderRadius: 20, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 10, borderWidth: 1, borderColor: '#ddd' },
  panelTitle: { fontSize: 22, fontWeight: '900', marginBottom: 15, color: '#000', textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderBottomWidth: 2, borderBottomColor: '#333', paddingBottom: 5 },
  input: { flex: 1, height: 40, marginLeft: 10, fontSize: 18, color: '#000', fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 5 },
  switchText: { fontSize: 15, fontWeight: 'bold', color: '#D32F2F' },
  button: { backgroundColor: '#0066FF', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 5 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});