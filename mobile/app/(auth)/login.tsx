import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '../../store/auth.store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Colors, Typography, Spacing, Radius } from '../../constants/theme';
import { BASE_URL } from '../../services/api';
import { useBrand, BRAND_LOGOS } from '../../hooks/useBrand';
import { APP_VERSION_FOOTER } from '../../constants/version';

export default function LoginScreen() {
  const { signIn, isLoading } = useAuthStore();
  const { brand, loading: brandLoading } = useBrand();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!email.trim()) newErrors.email = 'Informe o e-mail';
    if (!password) newErrors.password = 'Informe a senha';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      await signIn(email.trim(), password);
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail ?? 'Erro ao conectar. Verifique sua conexão.';
      Alert.alert('Falha no login', msg);
    }
  };

  const logoSource = BRAND_LOGOS[brand.logo_asset] ?? BRAND_LOGOS.horus;
  const primaryColor = brand.primary_color;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Header */}
        <View style={styles.header}>
          {brandLoading ? (
            <View style={[styles.logoPlaceholder, { backgroundColor: primaryColor + '30' }]}>
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : (
            <View style={[styles.logoWrapper, { shadowColor: primaryColor }]}>
              <Image
                source={logoSource}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          )}

          <Text style={styles.appName}>{brand.app_name}</Text>
          <Text style={styles.subtitle}>{brand.app_subtitle}</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="E-mail"
            placeholder="seu@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            error={errors.email}
          />

          <Input
            label="Senha"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            error={errors.password}
            rightIcon={
              <Text style={[styles.showPasswordText, { color: primaryColor }]}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </Text>
            }
            onRightIconPress={() => setShowPassword((v) => !v)}
          />

          <Button
            label="Entrar"
            onPress={handleLogin}
            loading={isLoading}
            style={[styles.loginButton, { backgroundColor: primaryColor }]}
          />

          {/* Dev info */}
          {__DEV__ && (
            <View style={styles.devInfo}>
              <Text style={styles.devText}>🔧 Dev mode</Text>
              <Text style={styles.devText}>API: {BASE_URL}</Text>
              <Text style={styles.devText}>Tenant: {brand.tenant_id}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Rodapé de versão */}
      <View style={styles.versionFooter}>
        <Text style={styles.versionText}>{APP_VERSION_FOOTER}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing['4xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  logoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: Radius.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoWrapper: {
    width: 110,
    height: 110,
    borderRadius: Radius.xl,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    padding: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  logo: {
    width: 80,
    height: 80,
  },
  appName: {
    color: Colors.textPrimary,
    fontSize: Typography.size['2xl'],
    fontWeight: Typography.weight.bold,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.size.base,
  },
  form: {
    gap: Spacing.base,
  },
  loginButton: {
    marginTop: Spacing.sm,
  },
  showPasswordText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  devInfo: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    gap: 2,
  },
  devText: {
    color: Colors.warning,
    fontSize: Typography.size.xs,
    fontFamily: 'monospace',
  },
  versionFooter: {
    alignItems: 'center',
    paddingBottom: Spacing['2xl'],
    paddingTop: Spacing.md,
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: Typography.size.xs,
    letterSpacing: 0.5,
  },
});
