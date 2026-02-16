import { useEffect, useState } from 'react'
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Label,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@glean/ui'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import api from '../lib/api'

interface ImplicitFeedbackSettings {
  enabled: boolean
  weight: number
  sample_rate: number
  min_events: number
  list_min_visible_ratio: number
  list_exposed_ms: number
  list_skimmed_ms: number
}

interface RecencyDecaySettings {
  enabled: boolean
  start_day: number
  half_life_days: number
  floor_factor: number
}

export default function RegistrationSettingsPage() {
  const { t } = useTranslation(['admin', 'common'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [savingImplicit, setSavingImplicit] = useState(false)
  const [savingRecency, setSavingRecency] = useState(false)
  const [implicitSettings, setImplicitSettings] = useState<ImplicitFeedbackSettings>({
    enabled: false,
    weight: 1.0,
    sample_rate: 1.0,
    min_events: 3,
    list_min_visible_ratio: 0.5,
    list_exposed_ms: 300,
    list_skimmed_ms: 600,
  })
  const [recencySettings, setRecencySettings] = useState<RecencyDecaySettings>({
    enabled: true,
    start_day: 3,
    half_life_days: 2,
    floor_factor: 0.05,
  })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const [registrationRes, implicitRes, recencyRes] = await Promise.all([
        api.get('/settings/registration'),
        api.get('/settings/implicit-feedback'),
        api.get('/settings/recency-decay'),
      ])
      setRegistrationEnabled(registrationRes.data.enabled)
      setImplicitSettings(implicitRes.data as ImplicitFeedbackSettings)
      setRecencySettings(recencyRes.data as RecencyDecaySettings)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch settings:', err)
      setError('Failed to load system settings')
    } finally {
      setLoading(false)
    }
  }

  const handleRegistrationToggle = async (checked: boolean) => {
    try {
      setUpdating(true)
      await api.post(`/settings/registration?enabled=${checked}`)
      setRegistrationEnabled(checked)
      setError(null)
    } catch (err) {
      console.error('Failed to update setting:', err)
      setError('Failed to update registration setting')
      // Revert switch state
      setRegistrationEnabled(!checked)
    } finally {
      setUpdating(false)
    }
  }

  const handleSaveImplicitSettings = async () => {
    try {
      setSavingImplicit(true)
      await api.post('/settings/implicit-feedback', implicitSettings)
      setError(null)
    } catch (err) {
      console.error('Failed to update implicit feedback settings:', err)
      setError('Failed to update implicit feedback settings')
    } finally {
      setSavingImplicit(false)
    }
  }

  const handleSaveRecencySettings = async () => {
    try {
      setSavingRecency(true)
      await api.post('/settings/recency-decay', recencySettings)
      setError(null)
    } catch (err) {
      console.error('Failed to update recency decay settings:', err)
      setError('Failed to update recency decay settings')
    } finally {
      setSavingRecency(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border bg-card border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">
              {t('admin:settings.system.title', 'System Settings')}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(
                'admin:settings.system.subtitle',
                'Manage global configuration for your Glean instance.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="space-y-8">
          {error && (
            <Alert variant="error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('common:error', 'Error')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('admin:settings.registration.title', 'User Registration')}</CardTitle>
              <CardDescription>
                {t(
                  'admin:settings.registration.description',
                  'Control whether new users can sign up for an account. Existing users will still be able to log in.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between space-x-2">
              <Label htmlFor="registration-mode" className="flex flex-col items-start space-y-1">
                <span>{t('admin:settings.registration.enableLabel', 'Enable Registration')}</span>
                <span className="text-muted-foreground font-normal">
                  {registrationEnabled
                    ? t('admin:settings.registration.enabled', 'New users can sign up.')
                    : t('admin:settings.registration.disabled', 'Sign up is disabled.')}
                </span>
              </Label>
              <Switch
                id="registration-mode"
                checked={registrationEnabled}
                onCheckedChange={handleRegistrationToggle}
                disabled={updating}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>List Engagement Tracking</CardTitle>
              <CardDescription>
                Configure list-level exposed/skimmed signals. This does not auto-mark not-interested.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="implicit-enabled" className="flex flex-col items-start space-y-1">
                  <span>Enable Implicit Feedback</span>
                  <span className="text-muted-foreground font-normal">
                    Use behavior signals in recommendation scoring.
                  </span>
                </Label>
                <Switch
                  id="implicit-enabled"
                  checked={implicitSettings.enabled}
                  onCheckedChange={(checked) =>
                    setImplicitSettings((prev) => ({ ...prev, enabled: checked }))
                  }
                  disabled={savingImplicit}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="list-min-visible-ratio">Min visible ratio (0.1-1.0)</Label>
                  <Input
                    id="list-min-visible-ratio"
                    type="number"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={implicitSettings.list_min_visible_ratio}
                    onChange={(e) =>
                      setImplicitSettings((prev) => ({
                        ...prev,
                        list_min_visible_ratio: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="list-exposed-ms">Exposed threshold (ms)</Label>
                  <Input
                    id="list-exposed-ms"
                    type="number"
                    min={50}
                    max={5000}
                    step={50}
                    value={implicitSettings.list_exposed_ms}
                    onChange={(e) =>
                      setImplicitSettings((prev) => ({
                        ...prev,
                        list_exposed_ms: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="list-skimmed-ms">Skimmed threshold (ms)</Label>
                  <Input
                    id="list-skimmed-ms"
                    type="number"
                    min={100}
                    max={10000}
                    step={50}
                    value={implicitSettings.list_skimmed_ms}
                    onChange={(e) =>
                      setImplicitSettings((prev) => ({
                        ...prev,
                        list_skimmed_ms: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="implicit-weight">Implicit weight</Label>
                  <Input
                    id="implicit-weight"
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={implicitSettings.weight}
                    onChange={(e) =>
                      setImplicitSettings((prev) => ({
                        ...prev,
                        weight: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveImplicitSettings} disabled={savingImplicit}>
                  {savingImplicit ? 'Saving...' : 'Save List Tracking Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>News Recency Decay</CardTitle>
              <CardDescription>
                Down-weight older articles in Smart ranking using published_at.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between space-x-2">
                <Label htmlFor="recency-enabled" className="flex flex-col items-start space-y-1">
                  <span>Enable Recency Decay</span>
                  <span className="text-muted-foreground font-normal">
                    Apply exponential decay to preference scores for older items.
                  </span>
                </Label>
                <Switch
                  id="recency-enabled"
                  checked={recencySettings.enabled}
                  onCheckedChange={(checked) =>
                    setRecencySettings((prev) => ({ ...prev, enabled: checked }))
                  }
                  disabled={savingRecency}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="start-day">Start day</Label>
                  <Input
                    id="start-day"
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={recencySettings.start_day}
                    onChange={(e) =>
                      setRecencySettings((prev) => ({
                        ...prev,
                        start_day: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="half-life-days">Half-life days</Label>
                  <Input
                    id="half-life-days"
                    type="number"
                    min={0.1}
                    max={365}
                    step={0.5}
                    value={recencySettings.half_life_days}
                    onChange={(e) =>
                      setRecencySettings((prev) => ({
                        ...prev,
                        half_life_days: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floor-factor">Floor factor</Label>
                  <Input
                    id="floor-factor"
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={recencySettings.floor_factor}
                    onChange={(e) =>
                      setRecencySettings((prev) => ({
                        ...prev,
                        floor_factor: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveRecencySettings} disabled={savingRecency}>
                  {savingRecency ? 'Saving...' : 'Save Recency Decay Settings'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
