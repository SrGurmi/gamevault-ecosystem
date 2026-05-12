import React, { useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Animated,
  TextInput,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  BarcodeScanningResult,
} from "expo-camera";
import { supabase } from "../../lib/supabase";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");
const FRAME_SIZE = width * 0.72;

const GV_DARK = "#040a14";
const GV_EMERALD = "#10b981";

type ScanMode = "barcode" | "cover";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastResult, setLastResult] = useState<{
    title: string;
    barcode: string;
  } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanMode>("barcode");
  const isLockedRef = useRef(false);
  const cameraRef = useRef<CameraView | null>(null);
  const scanAnim = useRef(new Animated.Value(0)).current;

  // Animated scan line
  const startScanAnim = React.useCallback(() => {
    scanAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [scanAnim]);

  React.useEffect(() => {
    if (mode === "barcode" && !scanned && !isSaving) startScanAnim();
    else scanAnim.stopAnimation();
  }, [mode, scanned, isSaving, startScanAnim, scanAnim]);

  const switchMode = (next: ScanMode) => {
    if (isSaving || mode === next) return;
    isLockedRef.current = false;
    setScanned(false);
    setShowManual(false);
    setManualQuery("");
    setPendingBarcode(null);
    setMode(next);
  };

  const scanLineTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-2, FRAME_SIZE - 4],
  });

  /* ── Permission screens ── */
  if (!permission)
    return (
      <View style={styles.darkScreen}>
        <ActivityIndicator size="large" color={GV_EMERALD} />
      </View>
    );

  if (!permission.granted)
    return (
      <View style={styles.darkScreen}>
        <View style={styles.permCard}>
          <View style={styles.permIconWrap}>
            <Text style={styles.permIcon}>📷</Text>
          </View>
          <Text style={styles.permTitle}>Acceso a Cámara</Text>
          <Text style={styles.permBody}>
            Necesitamos tu cámara para escanear los códigos de barras de tus
            juegos físicos y añadirlos a tu vault.
          </Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={requestPermission}
          >
            <Text style={styles.btnPrimaryText}>Habilitar Cámara</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

  /* ── Core save logic ── */
  const persistGame = async (gameData: any, barcode: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Debes iniciar sesión para guardar juegos.");

    await supabase.from("games").upsert({
      id: gameData.id,
      title: gameData.name,
      summary: gameData.summary,
      cover_url: gameData.cover?.url,
    });

    const { error: invError } = await supabase.from("inventory_items").insert([
      {
        game_id: gameData.id,
        barcode,
        user_id: user.id,
        status: "available",
      },
    ]);

    if (invError) {
      if (invError.code === "23505")
        throw new Error("Este juego ya está en tu colección.");
      throw invError;
    }
    return gameData.name as string;
  };

  const saveToInventory = async (barcode: string) => {
    setIsSaving(true);
    try {
      const { data: gameData, error: funcError } =
        await supabase.functions.invoke("get-game-details", {
          body: { barcode },
        });

      if (funcError) throw new Error(`Error de conexión: ${funcError.message}`);
      if (!gameData || gameData.error) {
        // Offer manual fallback instead of hard error
        setPendingBarcode(barcode);
        setShowManual(true);
        setScanned(false);
        isLockedRef.current = false;
        return;
      }

      const title = await persistGame(gameData, barcode);
      setLastResult({ title, barcode });
    } catch (err: any) {
      Alert.alert("Aviso", err.message || "Error al procesar el código.");
      isLockedRef.current = false;
      setScanned(false);
      setLastResult(null);
    } finally {
      setIsSaving(false);
    }
  };

  const buildOcrBody = async (
    base64: string,
    photoUri: string,
  ): Promise<{ imageBase64?: string; imageUrl?: string; mimeType: string }> => {
    const STORAGE_THRESHOLD = 700_000; // ~700KB raw → keep base64 well under 1MB POST
    const estBytes = (base64.length * 3) / 4;

    if (estBytes <= STORAGE_THRESHOLD) {
      return { imageBase64: base64, mimeType: "image/jpeg" };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Debes iniciar sesión para subir imágenes grandes.");

    const path = `${user.id}/${Date.now()}.jpg`;
    const resp = await fetch(photoUri);
    const blob = await resp.blob();

    const { error: uploadErr } = await supabase.storage
      .from("game-covers")
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: signed, error: signedErr } = await supabase.storage
      .from("game-covers")
      .createSignedUrl(path, 60);
    if (signedErr || !signed)
      throw signedErr ?? new Error("No se pudo firmar la URL de la imagen.");

    return { imageUrl: signed.signedUrl, mimeType: "image/jpeg" };
  };

  const captureCover = async () => {
    if (isLockedRef.current || isSaving) return;
    if (!cameraRef.current) {
      Alert.alert("Cámara no lista", "Intenta de nuevo en un momento.");
      return;
    }
    isLockedRef.current = true;
    setIsSaving(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.35,
        base64: true,
        skipProcessing: true,
      });
      if (!photo?.base64 || !photo?.uri)
        throw new Error("No se pudo capturar la imagen.");

      const body = await buildOcrBody(photo.base64, photo.uri);

      const { data: gameData, error: funcError } =
        await supabase.functions.invoke("recognize-game-cover", { body });

      if (funcError) throw new Error(`Error de conexión: ${funcError.message}`);
      if (!gameData || gameData.error) {
        const candidate = gameData?._ocr?.candidate;
        setPendingBarcode(null);
        setManualQuery(candidate ?? "");
        setShowManual(true);
        isLockedRef.current = false;
        return;
      }

      const generatedBarcode = `ocr-${gameData.id}-${Date.now()}`;
      const title = await persistGame(gameData, generatedBarcode);
      setLastResult({ title, barcode: generatedBarcode });
    } catch (err: any) {
      Alert.alert("Aviso", err.message || "Error al procesar la carátula.");
      isLockedRef.current = false;
      setLastResult(null);
    } finally {
      setIsSaving(false);
    }
  };

  const saveManual = async () => {
    const q = manualQuery.trim();
    if (!q) return;
    setIsSaving(true);
    setShowManual(false);
    try {
      // Detect if it looks like a numeric IGDB ID
      const isId = /^\d+$/.test(q);
      const body = isId ? { igdbId: Number(q) } : { searchQuery: q };
      const { data: gameData, error: funcError } =
        await supabase.functions.invoke("get-game-details", { body });

      if (funcError) throw new Error(`Error de conexión: ${funcError.message}`);
      if (!gameData || gameData.error)
        throw new Error(gameData?.error || "Juego no encontrado en IGDB.");

      const barcode = pendingBarcode || `manual-${Date.now()}`;
      const title = await persistGame(gameData, barcode);
      setLastResult({ title, barcode });
      setManualQuery("");
      setPendingBarcode(null);
    } catch (err: any) {
      Alert.alert("No encontrado", err.message);
      setShowManual(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (isLockedRef.current) return;
    isLockedRef.current = true;
    setScanned(true);
    saveToInventory(result.data);
  };

  const resetScanner = () => {
    isLockedRef.current = false;
    setScanned(false);
    setLastResult(null);
    setShowManual(false);
    setManualQuery("");
    setPendingBarcode(null);
    startScanAnim();
  };

  /* ── Render ── */
  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={
          mode === "barcode" && !scanned && !isSaving
            ? handleBarcodeScanned
            : undefined
        }
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "upc_a"] }}
      />

      {/* Dark overlay areas */}
      <View style={styles.overlay} pointerEvents="none">
        {/* Top shade */}
        <View style={[styles.shade, { height: (height - FRAME_SIZE) / 2 }]} />

        {/* Middle row: shade | frame | shade */}
        <View style={{ flexDirection: "row", height: FRAME_SIZE }}>
          <View style={[styles.shade, { flex: 1 }]} />
          <View style={styles.frame}>
            {/* Corners */}
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            {/* Animated scan line — barcode mode only */}
            {mode === "barcode" && !scanned && !isSaving && (
              <Animated.View
                style={[
                  styles.scanLine,
                  { transform: [{ translateY: scanLineTranslate }] },
                ]}
              />
            )}
          </View>
          <View style={[styles.shade, { flex: 1 }]} />
        </View>

        {/* Bottom shade */}
        <View style={[styles.shade, { flex: 1 }]} />
      </View>

      {/* Top header */}
      <BlurView intensity={25} tint="dark" style={styles.topBar}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoBadgeText}>▦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>GameVault Scanner</Text>
          <Text style={styles.topSub}>
            {mode === "barcode"
              ? "Apunta al código de barras"
              : "Apunta a la carátula"}
          </Text>
        </View>
        <View style={styles.modeToggle}>
          <TouchableOpacity
            onPress={() => switchMode("barcode")}
            disabled={isSaving}
            style={[
              styles.modeBtn,
              mode === "barcode" && styles.modeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.modeBtnText,
                mode === "barcode" && styles.modeBtnTextActive,
              ]}
            >
              EAN
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => switchMode("cover")}
            disabled={isSaving}
            style={[
              styles.modeBtn,
              mode === "cover" && styles.modeBtnActive,
            ]}
          >
            <Text
              style={[
                styles.modeBtnText,
                mode === "cover" && styles.modeBtnTextActive,
              ]}
            >
              OCR
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      {/* Frame label */}
      <View style={styles.frameLabelWrap}>
        <View style={styles.frameLabel}>
          <Text style={styles.frameLabelText}>
            {isSaving
              ? "⬡  Identificando…"
              : scanned
                ? "✓  Código capturado"
                : mode === "barcode"
                  ? "▦  Esperando código"
                  : "◫  Encuadra la carátula"}
          </Text>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        {/* Success result */}
        {lastResult && !isSaving && (
          <View style={styles.resultCard}>
            <View style={styles.resultDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle} numberOfLines={1}>
                {lastResult.title}
              </Text>
              <Text style={styles.resultSub}>Añadido a tu colección ✓</Text>
            </View>
          </View>
        )}

        {/* Action / status */}
        {isSaving ? (
          <View style={styles.processingRow}>
            <ActivityIndicator color={GV_EMERALD} />
            <View style={{ marginLeft: 14 }}>
              <Text style={styles.processingTitle}>Identificando activo…</Text>
              <Text style={styles.processingSubtitle}>
                {mode === "barcode"
                  ? "Consultando IGDB & Global UPC"
                  : "Procesando OCR & consultando IGDB"}
              </Text>
            </View>
          </View>
        ) : showManual ? (
          <View style={styles.manualBox}>
            <Text style={styles.manualTitle}>
              🔍 Código no identificado — busca manualmente
            </Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Nombre del juego ó ID de IGDB (ej. 2182)"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={manualQuery}
              onChangeText={setManualQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={saveManual}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1 }]}
                onPress={saveManual}
              >
                <Text style={styles.btnPrimaryText}>Buscar y Añadir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={resetScanner}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : lastResult ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={resetScanner}>
            <Text style={styles.btnPrimaryText}>Escanear otro juego</Text>
          </TouchableOpacity>
        ) : mode === "cover" ? (
          <>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={captureCover}
            >
              <Text style={styles.btnPrimaryText}>📸  Capturar carátula</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowManual(true)}
              style={styles.manualLink}
            >
              <Text style={styles.manualLinkText}>
                Búsqueda manual por nombre ó ID IGDB
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.readyRow}>
              <View style={styles.readyDot} />
              <Text style={styles.readyText}>
                Listo • Alta precisión automática
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowManual(true)}
              style={styles.manualLink}
            >
              <Text style={styles.manualLinkText}>
                Búsqueda manual por nombre ó ID IGDB
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Bottom tip */}
        <Text style={styles.tipText}>
          {mode === "barcode"
            ? "Compatible con EAN-13 y UPC-A"
            : "OCR · enfoca el título de la carátula"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  darkScreen: {
    flex: 1,
    backgroundColor: GV_DARK,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  /* Overlay */
  overlay: { ...StyleSheet.absoluteFillObject },
  shade: { backgroundColor: "rgba(4,10,20,0.75)" },

  /* Scanner frame */
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    position: "relative",
    overflow: "hidden",
  },

  /* Corners */
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: GV_EMERALD,
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },

  /* Scan line */
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: GV_EMERALD,
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 10,
  },

  /* Top bar */
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: GV_EMERALD,
    justifyContent: "center",
    alignItems: "center",
  },
  logoBadgeText: { fontSize: 20, color: "#fff" },
  topTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  topSub: {
    color: `${GV_EMERALD}cc`,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },

  /* Frame label */
  frameLabelWrap: {
    position: "absolute",
    top: (height - FRAME_SIZE) / 2 + FRAME_SIZE + 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  frameLabel: {
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.25)",
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  frameLabelText: { color: GV_EMERALD, fontSize: 12, fontWeight: "700" },

  /* Bottom panel */
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 20,
    gap: 16,
    alignItems: "center",
    backgroundColor: "rgba(4,10,20,0.6)",
  },

  /* Result card */
  resultCard: {
    width: "100%",
    backgroundColor: "rgba(16,185,129,0.08)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resultDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GV_EMERALD,
  },
  resultTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  resultSub: {
    color: `${GV_EMERALD}aa`,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },

  /* Processing */
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    width: "100%",
  },
  processingTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  processingSubtitle: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    marginTop: 2,
  },

  /* Ready row */
  readyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GV_EMERALD,
  },
  readyText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    fontWeight: "500",
  },

  /* Primary button */
  btnPrimary: {
    backgroundColor: GV_EMERALD,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    width: "100%",
    alignItems: "center",
    shadowColor: GV_EMERALD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  /* Tip */
  tipText: { color: "rgba(255,255,255,0.2)", fontSize: 11, fontWeight: "500" },

  /* Permission card */
  permCard: {
    backgroundColor: "#0c1628",
    borderRadius: 28,
    padding: 32,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  permIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "rgba(16,185,129,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.2)",
  },
  permIcon: { fontSize: 36 },
  permTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 12,
  },
  permBody: {
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 14,
    marginBottom: 32,
  },

  /* Mode toggle */
  modeToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 99,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    minWidth: 44,
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: GV_EMERALD },
  modeBtnText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  modeBtnTextActive: { color: "#fff" },

  /* Manual search */
  manualBox: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  manualTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  manualInput: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  btnSecondary: {
    backgroundColor: "transparent",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  manualLink: { marginTop: 8 },
  manualLinkText: {
    color: GV_EMERALD,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
