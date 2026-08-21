import React, { useMemo, useState } from 'react';
import { TabsVertical, Tab, TabListVertical, TabPanels, TabPanel, Tile, ContainedList, ContainedListItem, Button, Tag, TextInput } from '@carbon/react';
import { useParams } from 'react-router-dom';
import { launchWorkspace2, ResponsiveWrapper, useSession } from '@openmrs/esm-framework';

import {
    useEnrollments,
    usePatientProgramVisitTypes,
    useForms,
    useVisits,
} from './patient-care.resource';
import styles from './patient-care.scss';

// Helper function to get a single letter icon from text
const getProgramIcon = (text: string): string => {
    if (!text) return '?';
    // Get the first letter, handling cases where it might start with a number or special character
    const firstChar = text.trim().charAt(0).toUpperCase();
    return /[A-Z]/.test(firstChar) ? firstChar : text.trim().charAt(0);
};

interface ProgramTabPanelProps {
    enrollment: any;
    patientUuid: string;
    forms: any[];
    activeVisits: any[];
    latestActiveVisit: any;
    launchForm: (form: any) => void;
}

const ProgramTabPanel: React.FC<ProgramTabPanelProps> = ({
    enrollment,
    patientUuid,
    forms,
    activeVisits,
    latestActiveVisit,
    launchForm,
}) => {
    const { sessionLocation } = useSession();
    const locationUuid = sessionLocation?.uuid || '';
    const [filterText, setFilterText] = useState('');

    // Use the same hook as the visit workspace
    const { allowedVisitTypes, isLoading: isLoadingVisitTypes } = usePatientProgramVisitTypes(
        patientUuid,
        enrollment.program.uuid,
        enrollment.uuid,
        locationUuid
    );

    // Get all active visit type UUIDs
    const activeVisitTypeUuids = new Set(
        activeVisits
            .map((v) => v.visitType?.uuid)
            .filter((uuid): uuid is string => !!uuid)
    );

    // Determine which forms to show based on allowedVisitTypes and allowedEncounters
    const allowedForms = useMemo(() => {
        if (!allowedVisitTypes || allowedVisitTypes.length === 0 || !forms) return [];

        // Check if any active visit type matches any of the program's allowed visit types
        const hasMatchingActiveVisit = allowedVisitTypes.some((vt) =>
            activeVisitTypeUuids.has(vt.uuid)
        );

        if (!hasMatchingActiveVisit) return [];

        const formsList: any[] = [];

        allowedVisitTypes.forEach(visitType => {
            // Use encounterTypes.allowedEncounters
            const allowedEncounters = visitType.encounterTypes?.allowedEncounters || [];
            
            allowedEncounters.forEach(encounterType => {
                // Find the latest published form for this encounter type
                const matchingForms = forms.filter(f =>
                    f.encounterType && f.encounterType.uuid === encounterType.uuid && f.published
                );

                if (matchingForms.length > 0) {
                    // Sort by version to get latest first
                    matchingForms.sort((a, b) => {
                        if (a.version > b.version) return -1;
                        if (a.version < b.version) return 1;
                        return 0;
                    });

                    const latestForm = matchingForms[0];
                    // Avoid duplicates
                    if (!formsList.find(f => f.uuid === latestForm.uuid)) {
                        formsList.push({
                            ...encounterType,
                            uuid: latestForm.uuid,
                            display: latestForm.name,
                            name: latestForm.name,
                            formUuid: latestForm.uuid
                        });
                    }
                }
            });
        });

        return formsList;
    }, [allowedVisitTypes, forms, activeVisitTypeUuids]);

    // Filter forms based on search text
    const filteredForms = useMemo(() => {
        if (!filterText.trim()) return allowedForms;
        const searchLower = filterText.toLowerCase();
        return allowedForms.filter(form => 
            form.display?.toLowerCase().includes(searchLower) ||
            form.name?.toLowerCase().includes(searchLower)
        );
    }, [allowedForms, filterText]);

    // Get active visits that match the program's allowed visit types
    const programActiveVisits = useMemo(() => {
        if (!allowedVisitTypes || allowedVisitTypes.length === 0 || !activeVisits) return [];
        
        const allowedVisitTypeUuids = new Set(allowedVisitTypes.map(vt => vt.uuid));
        
        return activeVisits.filter(visit => {
            const visitTypeUuid = visit.visitType?.uuid;
            return visitTypeUuid && allowedVisitTypeUuids.has(visitTypeUuid);
        });
    }, [allowedVisitTypes, activeVisits]);

    if (isLoadingVisitTypes) {
        return (
            <div>
                <h4 style={{ marginBottom: '1rem' }}>{enrollment.program.display}</h4>
                <Tile>
                    <p>Loading forms...</p>
                </Tile>
            </div>
        );
    }

    if (allowedForms.length > 0) {
        return (
            <div>
                <h4 style={{ marginBottom: '1rem' }}>{enrollment.program.display}</h4>
                <Tile style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}>
                            <h6 style={{ margin: 0 }}>Available Forms</h6>
                        {programActiveVisits.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                {programActiveVisits.map((visit) => (
                                    <Tag key={visit.uuid} type="blue">
                                        {visit.visitType?.name || visit.visitType?.display || 'Active Visit'}
                                    </Tag>
                                ))}
                            </div>
                        )}
                    </div>
                    <TextInput
                        id={`form-filter-${enrollment.uuid}`}
                        labelText=""
                        placeholder="Filter forms..."
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        size="sm"
                        style={{ maxWidth: '200px', marginLeft: 'auto' }}
                    />
                </div>
                <ContainedList kind="on-page">
                    {filteredForms.length > 0 ? (
                        filteredForms.map((form, index) => (
                            <ContainedListItem
                                key={`${form.uuid}-${index}`}
                                onClick={() => launchForm(form)}
                            >
                                {form.display}
                            </ContainedListItem>
                        ))
                    ) : (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#525252' }}>
                            No forms match your search.
                        </div>
                    )}
                </ContainedList>
            </Tile>
            </div>
        );
    }

    return (
        <div>
            <h4 style={{ marginBottom: '1rem' }}>{enrollment.program.display}</h4>
            <Tile>
                <p>No forms available for this program. Use the "Start a Visit" button above to start a visit and access forms.</p>
            </Tile>
        </div>
    );
};

const NewExtensionComponent: React.FC = () => {
    const params = useParams();
    const patientUuid = params.patientUuid || window.location.pathname.split('/').find(part => part.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/));
    const { enrollments, isLoading: isLoadingEnrollments } = useEnrollments(patientUuid);
    const { forms, isLoading: isLoadingForms } = useForms();
    const { visits, isLoading: isLoadingVisits } = useVisits(patientUuid);
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    // Filter for active enrollments
    const activeEnrollments = useMemo(() => {
        return enrollments.filter((e) => !e.dateCompleted);
    }, [enrollments]);

    // Get all active visits (no stopDatetime means active)
    const activeVisits = useMemo(() => {
        if (!visits || visits.length === 0) return [];
        return visits.filter((v) => !v.stopDatetime);
    }, [visits]);

    // Get the latest active visit for passing to form launch (still needed for form context)
    const latestActiveVisit = useMemo(() => {
        if (activeVisits.length === 0) return null;
        
        // Sort by startDatetime descending to get the latest first
        const sortedVisits = [...activeVisits].sort((a, b) => {
            const dateA = new Date(a.startDatetime).getTime();
            const dateB = new Date(b.startDatetime).getTime();
            return dateB - dateA; // Descending order
        });
        
        return sortedVisits[0];
    }, [activeVisits]);


    const launchForm = (form: any) => {
        // Prepare form object. If the config object has formUuid, use it.
        // The workspace usually expects { name, uuid } minimum for form.
        const targetForm = {
            ...form,
            name: form.display || form.name,
            uuid: form.formUuid || form.uuid,
        };

        // Use launchWorkspace2 to open form in the workspace panel
        // Pass the latest active visit if available
        launchWorkspace2('patient-form-entry-workspace', {
            workspaceTitle: targetForm.name,
            form: targetForm,
            encounterUuid: undefined, // undefined for new forms
            additionalProps: {
                mode: 'enter', // 'enter' for new forms
                formSessionIntent: '*',
                openClinicalFormsWorkspaceOnFormClose: false,
                visit: latestActiveVisit, // Pass the latest active visit
            },
        });
    };

    const launchProgramManager = () => {
        launchWorkspace2('program-manager-workspace', {
            workspaceTitle: 'Manage Programs',
            patientUuid: patientUuid
        });
    };

    const handleStartVisit = (enrollmentUuid: string, programUuid: string, programDisplay: string) => {
        launchWorkspace2('ampath-visit-workspace', {
            workspaceTitle: `Start Visit - ${programDisplay}`,
            patientUuid: patientUuid,
            programUuid: programUuid,
            enrollmentUuid: enrollmentUuid,
            programDisplay: programDisplay,
        });
    };

    if (isLoadingEnrollments || isLoadingVisits || isLoadingForms) {
        return <div>Loading programs...</div>;
    }

    if (activeEnrollments.length === 0) {
        return (
            <div>
                <div className={styles.headerActions}>
                    <Button onClick={launchProgramManager} kind="ghost">Manage Programs</Button>
                </div>
                <div>No active program enrollments found.</div>
            </div>
        );
    }

    // Get the active program based on the selected tab
    const activeProgram = activeEnrollments[activeTabIndex];

    return (
        <ResponsiveWrapper>
            <div className={styles.tabContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>Patient Care Dashboard</h4>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {activeProgram && (
                            <Button
                                onClick={() =>
                                    handleStartVisit(
                                        activeProgram.uuid,
                                        activeProgram.program.uuid,
                                        activeProgram.program.display,
                                    )
                                }
                                size="sm"
                                kind="ghost"
                            >
                                Start a Visit
                            </Button>
                        )}
                        <Button onClick={launchProgramManager} size="sm" kind="ghost">Manage Programs</Button>
                    </div>
                </div>
                <TabsVertical height="600px" onChange={({ selectedIndex }) => setActiveTabIndex(selectedIndex)}>
                    <TabListVertical aria-label="List of enrolled programs">
                        {activeEnrollments.map((enrollment) => {
                            const iconLetter = getProgramIcon(enrollment.program.display);
                            return (
                                <Tab 
                                    key={enrollment.uuid} 
                                    aria-label={enrollment.program.display}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                backgroundColor: '#0f62fe',
                                                color: 'white',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                flexShrink: 0,
                                            }}
                                        >
                                            {iconLetter}
                                        </div>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {enrollment.program.display}
                                        </span>
                                    </div>
                                </Tab>
                            );
                        })}
                    </TabListVertical>
                    <TabPanels>
                        {activeEnrollments.map((enrollment) => (
                            <TabPanel key={enrollment.uuid}>
                                <ProgramTabPanel
                                    enrollment={enrollment}
                                    patientUuid={patientUuid}
                                    forms={forms}
                                    activeVisits={activeVisits}
                                    latestActiveVisit={latestActiveVisit}
                                    launchForm={launchForm}
                                />
                            </TabPanel>
                        ))}
                    </TabPanels>
                </TabsVertical>
            </div>
        </ResponsiveWrapper>
    );
};

export default NewExtensionComponent;
