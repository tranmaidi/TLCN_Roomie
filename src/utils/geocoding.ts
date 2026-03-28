import axios from "axios";

export interface Coordinates {
  lat: number;
  lng: number;
}

const CITY_COORDINATES: Record<string, Coordinates> = {
  "Hanoi": { lat: 21.0285, lng: 105.8554 },
  "Hồ Chí Minh": { lat: 10.7769, lng: 106.7009 },
  "Đà Nẵng": { lat: 16.0544, lng: 108.2022 },
  "Hải Phòng": { lat: 20.8449, lng: 106.6881 },
  "Cần Thơ": { lat: 10.0379, lng: 105.7869 },
};

/**
 * Lấy tọa độ từ địa chỉ — ưu tiên Mapbox → fallback Nominatim → fallback city
 * Đảm bảo luôn trả về tọa độ
 */
export async function getLatLngFromAddress(address: string, fallbackCity?: string): Promise<Coordinates> {
  //1: Mapbox Geocoding API (ưu tiên — nhanh, chính xác, miễn phí)
  if (process.env.MAPBOX_ACCESS_TOKEN) {
    try {
      const encodedAddress = encodeURIComponent(address);
      const res = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json`,
        {
          params: {
            access_token: process.env.MAPBOX_ACCESS_TOKEN,
            limit: 1,
          },
          timeout: 5000,
        }
      );

      if (res.data.features && res.data.features.length > 0) {
        const [lng, lat] = res.data.features[0].geometry.coordinates;
        console.log(`[geocoding] Mapbox: "${address}" -> [${lng}, ${lat}]`);
        return { lat, lng };
      }
    } catch (error: any) {
      console.warn(`[geocoding] Mapbox error: ${error.message}`);
    }
  }

  //2: Nominatim (fallback miễn phí)
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: {
        q: address,
        format: "json",
        limit: 1,
      },
      headers: {
        "User-Agent": "TLCN-RentalApp/1.0 (Geocoding Service)",
      },
      timeout: 5000,
    });

    if (res.data && res.data.length > 0) {
      const result = res.data[0];
      console.log(`[geocoding] Nominatim: "${address}" -> [${result.lon}, ${result.lat}]`);
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
      };
    }
  } catch (error: any) {
    console.warn(`[geocoding] Nominatim error: ${error.message}`);
  }

  //3: Fallback tọa độ thành phố (luôn có kết quả)
  if (fallbackCity) {
    const cityCoords = CITY_COORDINATES[fallbackCity];
    if (cityCoords) {
      console.log(`[geocoding] Fallback city: "${fallbackCity}" -> [${cityCoords.lng}, ${cityCoords.lat}]`);
      return cityCoords;
    }
  }

  //4: Fallback cuối cùng (Hanoi)
  console.warn(`[geocoding] All methods failed, using Hanoi as default`);
  return CITY_COORDINATES["Hanoi"];
}

/**
 * Format địa chỉ đầy đủ từ các thành phần
 */
export function formatAddress(address: string, ward?: string, district?: string, city?: string): string {
  const parts = [address, ward, district, city].filter(Boolean);
  return parts.join(", ");
}