import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { EarnedShareCard } from '@/lib/share-cards/types';
import { shareCardView } from '@/lib/share-cards/export';
import { trackShareCardEvent } from '@/lib/share-cards/analytics';
import { ShareCardPreview } from './share-card-preview';
import { useTheme } from '@/hooks/use-theme';

/** Mirrors the main web app's ShareCardModal (inside YourWinsSection.tsx)
 * — Share + "Not now" / "Don't show this one again", via the native share
 * sheet instead of download/Web Share API. */
export function ShareCardModal({
  card,
  visible,
  onClose,
  onDismissForever,
  sourceSurface,
}: {
  card: EarnedShareCard | null;
  visible: boolean;
  onClose: () => void;
  onDismissForever?: (conceptId: string) => void;
  sourceSurface: 'dashboard' | 'achievements_page';
}) {
  const theme = useTheme();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  if (!card) return null;

  async function handleShare() {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const result = await shareCardView(cardRef, { dialogTitle: card!.headline });
      if (result === 'shared') {
        trackShareCardEvent('share_card_shared', {
          card_id: card!.concept.id,
          category: card!.concept.category,
          format: card!.format,
          source_surface: sourceSurface,
        });
      }
    } finally {
      setSharing(false);
    }
  }

  function trackDismissed() {
    trackShareCardEvent('share_card_dismissed', {
      card_id: card!.concept.id,
      category: card!.concept.category,
      format: card!.format,
      source_surface: sourceSurface,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={styles.cardWrap}>
            <ShareCardPreview ref={cardRef} card={card} />
          </View>

          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={[styles.shareButton, { backgroundColor: theme.primary, opacity: sharing ? 0.6 : 1 }]}
          >
            <Text style={styles.shareButtonText}>{sharing ? 'Sharing…' : card.concept.shareCta}</Text>
          </Pressable>

          <View style={styles.dismissRow}>
            <Pressable
              onPress={() => {
                trackDismissed();
                onClose();
              }}
            >
              <Text style={styles.dismissText}>Not now</Text>
            </Pressable>
            {onDismissForever && (
              <Pressable
                onPress={() => {
                  trackDismissed();
                  onDismissForever(card.concept.id);
                  onClose();
                }}
              >
                <Text style={styles.dismissText}>Don&apos;t show this one again</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  cardWrap: { alignItems: 'center', marginBottom: 16 },
  shareButton: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center' },
  shareButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  dismissRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 14 },
  dismissText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
});
