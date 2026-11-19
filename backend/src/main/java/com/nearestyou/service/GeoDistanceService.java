package com.nearestyou.service;

import org.springframework.stereotype.Service;

@Service
public class GeoDistanceService {

    private static final double EARTH_RADIUS_KM = 6371.0;

    public double calculateDistanceKm(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(EARTH_RADIUS_KM * c * 100.0) / 100.0;
    }

    public boolean isValidCoordinates(double lat, double lng) {
        return !Double.isNaN(lat) && !Double.isNaN(lng)
                && lat >= -90.0 && lat <= 90.0
                && lng >= -180.0 && lng <= 180.0;
    }
}
