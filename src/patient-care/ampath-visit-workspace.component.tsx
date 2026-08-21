import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Form,
    FormGroup,
    Select,
    SelectItem,
    Tile,
    InlineLoading,
} from '@carbon/react';
import { showSnackbar, Workspace2, useSession, LocationPicker, formatDatetime } from '@openmrs/esm-framework';
import {
    useVisits,
    startVisit,
    usePatientProgramVisitTypes,
} from './patient-care.resource';
import styles from './program-manager-workspace.scss';

interface AmpathVisitWorkspaceProps {
    closeWorkspace: () => void;
    patientUuid?: string;
    programUuid?: string;
    enrollmentUuid?: string;
    programDisplay?: string;
    workspaceProps?: {
        patientUuid?: string;
        programUuid?: string;
        enrollmentUuid?: string;
        programDisplay?: string;
    };
}

const AmpathVisitWorkspace: React.FC<AmpathVisitWorkspaceProps> = (props) => {
    // In OpenMRS, workspace props are nested in workspaceProps
    const workspaceProps = (props as any).workspaceProps || {};
    const closeWorkspace = props.closeWorkspace;
    const patientUuid = workspaceProps.patientUuid || props.patientUuid;
    const programUuid = workspaceProps.programUuid || props.programUuid;
    const enrollmentUuid = workspaceProps.enrollmentUuid || props.enrollmentUuid;
    const programDisplay = workspaceProps.programDisplay || (props as any).programDisplay;
    
    const { t } = useTranslation();
    const { sessionLocation } = useSession();
    const [selectedVisitType, setSelectedVisitType] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<string>(sessionLocation?.uuid || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset selected visit type when location changes
    const handleLocationChange = (locationUuid: string) => {
        setSelectedLocation(locationUuid);
        setSelectedVisitType(''); // Reset visit type selection when location changes
    };
  
    if (!patientUuid || !programUuid || !enrollmentUuid) {
        return (
            <Workspace2
                title={
                    t('visitWorkspace.title', 'Start Visit') +
                    (programDisplay ? ` - ${programDisplay}` : '')
                }
            >
                <div className={styles.workspaceContent}>
                    <Tile className={styles.emptyState}>
                        {t('visitWorkspace.error', 'Error: Patient UUID, Program UUID, and Enrollment UUID are required')}
                    </Tile>
                </div>
            </Workspace2>
        );
    }

    // Fetch visit types from the endpoint - use selectedLocation or sessionLocation
    const locationForFetch = selectedLocation || sessionLocation?.uuid || '';
    const { allowedVisitTypes, isLoading: isLoadingVisitTypes } = usePatientProgramVisitTypes(
        patientUuid,
        programUuid,
        enrollmentUuid,
        locationForFetch
    );
  
    const { visits, isLoading: isLoadingVisits, mutate: mutateVisits } = useVisits(patientUuid);

    // Get visit type UUIDs from allowed visit types
    const visitTypeUuids = useMemo(() => {
        if (!allowedVisitTypes || !Array.isArray(allowedVisitTypes) || allowedVisitTypes.length === 0) {
            return [];
        }
        return allowedVisitTypes.map(vt => vt.uuid);
    }, [allowedVisitTypes]);

    // Filter visits by visit types and get active visit if exists
    const activeVisit = useMemo(() => {
        if (!visits || visits.length === 0 || visitTypeUuids.length === 0) return null;
        
        // Filter visits that match the allowed visit types and are active
        const matchingActiveVisits = visits.filter((v) => {
            const visitTypeUuid = v.visitType?.uuid;
            return !v.stopDatetime && visitTypeUuid && visitTypeUuids.includes(visitTypeUuid);
        });
        
        if (matchingActiveVisits.length === 0) return null;
        
        // Sort by startDatetime descending to get the latest first
        return matchingActiveVisits.sort((a, b) => 
            new Date(b.startDatetime).getTime() - new Date(a.startDatetime).getTime()
        )[0];
    }, [visits, visitTypeUuids]);

    const handleStartVisit = async () => {
        if (!selectedVisitType) {
            showSnackbar({
                kind: 'error',
                title: t('visitWorkspace.error', 'Error'),
                subtitle: t('visitWorkspace.visitTypeRequired', 'Please select a visit type'),
            });
            return;
        }

        if (!selectedLocation) {
            showSnackbar({
                kind: 'error',
                title: t('visitWorkspace.error', 'Error'),
                subtitle: t('visitWorkspace.locationRequired', 'Please select a location'),
            });
            return;
        }
        const visitType = allowedVisitTypes.find((vt) => vt.uuid === selectedVisitType);
        if (!visitType) {
            showSnackbar({
                kind: 'error',
                title: t('visitWorkspace.error', 'Error'),
                subtitle: t('visitWorkspace.invalidVisitType', 'Invalid visit type selected'),
            });
            return;
        }

        setIsSubmitting(true);
        try {
            await startVisit(patientUuid, selectedVisitType, selectedLocation);
            await mutateVisits();
            showSnackbar({
                kind: 'success',
                title: t('visitWorkspace.success', 'Visit Started'),
                subtitle: t('visitWorkspace.visitStartedSuccess', 'Successfully started {{visitTypeName}} visit.', {
                    visitTypeName: visitType.name,
                }),
            });
            closeWorkspace();
        } catch (error) {
            showSnackbar({
                kind: 'error',
                title: t('visitWorkspace.errorStarting', 'Error Starting Visit'),
                subtitle: error instanceof Error ? error.message : t('visitWorkspace.failedToStart', 'Failed to start visit.'),
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Workspace2
            title={
                t('visitWorkspace.title', 'Start Visit') +
                (programDisplay ? ` - ${programDisplay}` : '')
            }
        >
            <div className={styles.workspaceContent}>
                {activeVisit && (
                    <Tile className={styles.section}>
                        <h3 className={styles.sectionTitle}>
                            {t('visitWorkspace.activeVisit', 'Active Visit')}
                        </h3>
                        <p>
                            {t('visitWorkspace.activeVisitMessage', 'Patient has an active visit: {{visitType}}', {
                                visitType: activeVisit.visitType?.name || 
                                          activeVisit.visitType?.display || 
                                          (allowedVisitTypes.find(vt => vt.uuid === activeVisit.visitType?.uuid)?.name) ||
                                          'Unknown',
                            })}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#525252' }}>
                            {t('visitWorkspace.startedAt', 'Started: {{startDate}}', {
                                startDate: activeVisit.startDatetime ? formatDatetime(new Date(activeVisit.startDatetime)) : 'Unknown',
                            })}
                        </p>
                    </Tile>
                )}

                <Form className={styles.form}>
                    <FormGroup legendText={t('visitWorkspace.location', 'Location')}>
                        <div className={styles.locationPickerWrapper}>
                            <LocationPicker
                                selectedLocationUuid={selectedLocation}
                                defaultLocationUuid={sessionLocation?.uuid}
                                onChange={(locationUuid) => handleLocationChange(locationUuid || '')}
                            />
                        </div>
                        {!selectedLocation && (
                            <p style={{ fontSize: '0.875rem', color: '#8d3a3a', marginTop: '0.5rem' }}>
                                {t('visitWorkspace.locationRequired', 'Please select a location to see available visit types.')}
                            </p>
                        )}
                    </FormGroup>

                    {!selectedLocation ? (
                        <Tile className={styles.emptyState}>
                            {t('visitWorkspace.selectLocationFirst', 'Please select a location first to see available visit types.')}
                        </Tile>
                    ) : isLoadingVisitTypes ? (
                        <Tile className={styles.emptyState}>
                            <InlineLoading description={t('visitWorkspace.loadingVisitTypes', 'Loading visit types...')} />
                        </Tile>
                    ) : allowedVisitTypes.length === 0 ? (
                        <Tile className={styles.emptyState}>
                            {t('visitWorkspace.noVisitTypes', 'No visit types available for this program at the selected location.')}
                        </Tile>
                    ) : (
                        <FormGroup legendText={t('visitWorkspace.selectVisitType', 'Select Visit Type')}>
                            <Select
                                id="visit-type-select"
                                labelText={t('visitWorkspace.visitType', 'Visit Type')}
                                value={selectedVisitType}
                                onChange={(e) => setSelectedVisitType(e.target.value)}
                                disabled={isSubmitting || isLoadingVisitTypes}
                            >
                                <SelectItem value="" text={t('visitWorkspace.chooseVisitType', 'Choose a visit type...')} />
                                {allowedVisitTypes.map((visitType) => (
                                    <SelectItem
                                        key={visitType.uuid}
                                        value={visitType.uuid}
                                        text={visitType.name}
                                    />
                                ))}
                            </Select>
                            {selectedVisitType && allowedVisitTypes.find((vt) => vt.uuid === selectedVisitType)?.message && (
                                <p style={{ fontSize: '0.875rem', color: '#525252', marginTop: '0.5rem' }}>
                                    {allowedVisitTypes.find((vt) => vt.uuid === selectedVisitType)?.message}
                                </p>
                            )}
                        </FormGroup>
                    )}

                    <div className={styles.actions}>
                        <Button
                            kind="secondary"
                            onClick={closeWorkspace}
                            disabled={isSubmitting}
                        >
                            {t('visitWorkspace.cancel', 'Cancel')}
                        </Button>
                        <Button
                            kind="primary"
                            onClick={handleStartVisit}
                            disabled={isSubmitting || !selectedVisitType || !selectedLocation}
                        >
                            {isSubmitting ? (
                                <InlineLoading description={t('visitWorkspace.starting', 'Starting visit...')} />
                            ) : (
                                t('visitWorkspace.startVisit', 'Start Visit')
                            )}
                        </Button>
                    </div>
                </Form>
            </div>
        </Workspace2>
    );
};

export default AmpathVisitWorkspace;

