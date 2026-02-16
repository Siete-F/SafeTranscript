import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

export interface MapMarker {
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
}

interface MapProps {
    markers?: MapMarker[];
    initialRegion?: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
    style?: ViewStyle;
    showsUserLocation?: boolean;
}

export const Map = ({
    markers = [],
    initialRegion = {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    },
    style,
    showsUserLocation = false,
}: MapProps) => {
    const zoom = 13;

    const mapHtml = useMemo(() => {
        const markersJson = JSON.stringify(markers);
        const centerLat = initialRegion.latitude;
        const centerLng = initialRegion.longitude;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
            <style>
                body { margin: 0; padding: 0; }
                #map { height: 100vh; width: 100vw; }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <script>
                var map = L.map('map').setView([${centerLat}, ${centerLng}], ${zoom});

                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap'
                }).addTo(map);

                var markersData = ${markersJson};
                markersData.forEach(function(m) {
                    var marker = L.marker([m.latitude, m.longitude]).addTo(map);
                    if (m.title || m.description) {
                        marker.bindPopup("<b>" + (m.title || "") + "</b><br>" + (m.description || ""));
                    }
                });
            <\/script>
        </body>
        </html>
        `;
    }, [markers, initialRegion]);

    const srcDoc = typeof window !== 'undefined' ? mapHtml : undefined;

    return (
        <View style={[styles.container, style]}>
            {typeof window !== 'undefined' && (
                <iframe
                    srcDoc={srcDoc}
                    style={{ width: '100%', height: '100%', border: 'none', minHeight: 200 }}
                    title="Map"
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
        borderRadius: 12,
        width: '100%',
        minHeight: 200,
    },
});
