import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Button,
    Form,
    FormGroup,
    Select,
    SelectItem,
    ComboBox,
    DatePicker,
    DatePickerInput,
    DataTable,
    Table,
    TableHead,
    TableRow,
    TableHeader,
    TableBody,
    TableCell,
    DataTableSkeleton,
    InlineLoading,
    Tile,
    ProgressIndicator,
    ProgressStep,
} from '@carbon/react';
import {
    showSnackbar,
    Workspace2,
    formatDatetime,
    useLayoutType,
    useSession,
    LocationPicker,
    openmrsFetch,
    restBaseUrl,
} from '@openmrs/esm-framework';
import dayjs from 'dayjs';
import {
    usePrograms,
    useEnrollments,
    usePatientProgramConfig,
    enrollPatientInProgram,
    disenrollPatientFromProgram,
} from './patient-care.resource';
import styles from './program-manager-workspace.scss';

interface ProgramManagerWorkspaceProps {
    closeWorkspace: () => void;
    patientUuid?: string;
    workspaceProps?: {
        patientUuid?: string;
    };
}

type WizardStep = 'select' | 'details' | 'review' | 'success';

const ProgramManagerWorkspace: React.FC<ProgramManagerWorkspaceProps> = (props) => {
    // In OpenMRS, workspace props are nested in workspaceProps
    const workspaceProps = (props as any).workspaceProps || {};
    const closeWorkspace = props.closeWorkspace;
    const patientUuid = workspaceProps.patientUuid || props.patientUuid;
    const { t } = useTranslation();
    const layout = useLayoutType();
    const { sessionLocation } = useSession();
    const [currentStep, setCurrentStep] = useState<WizardStep>('select');
    const [selectedProgram, setSelectedProgram] = useState<string>('');
    const [selectedProgramName, setSelectedProgramName] = useState<string>('');
    const [enrollmentDate, setEnrollmentDate] = useState<Date | null>(null);
    const [locationUuid, setLocationUuid] = useState<string>(sessionLocation?.uuid || '');
    const [selectedLocationName, setSelectedLocationName] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});

    const { programs, isLoading: isLoadingPrograms } = usePrograms();
    const { enrollments, isLoading: isLoadingEnrollments, mutate: mutateEnrollments } = useEnrollments(patientUuid);
    const { config: programConfig, isLoading: isLoadingProgramConfig } = usePatientProgramConfig(patientUuid);

    // Load selected location name for review/success screens when locationUuid changes
    useEffect(() => {
        async function loadLocationName() {
            if (!locationUuid) {
                setSelectedLocationName('');
                return;
            }

            try {
                const response = await openmrsFetch<{ display?: string }>(
                    `${restBaseUrl}/location/${locationUuid}?v=custom:(uuid,name,display)`,
                );
                setSelectedLocationName(response.data?.display || '');
            } catch (error) {
                // If location lookup fails, keep name empty; enrollment can still proceed
                // Optionally log to console for debugging
                // console.error('Failed to load location name', error);
            }
        }

        void loadLocationName();
    }, [locationUuid]);


    console.log("enrollments",enrollments);
    // Active enrollments (matching patient care component)
    const activeEnrollments = useMemo(
        () => enrollments.filter((e) => !e.dateCompleted),
        [enrollments],
    );

    // Map of programUuid -> list of incompatible active program displays
    const programIncompatibilities: Record<string, string[]> = useMemo(() => {
        if (!programConfig) {
            return {};
        }

        const activeProgramUuidToDisplay = new Map(
            activeEnrollments.map((e) => [e.program.uuid, e.program.display]),
        );

        const result: Record<string, string[]> = {};

        programs.forEach((program) => {
            const configForProgram = (programConfig as any)[program.uuid];
            const incompatibleWith: string[] = configForProgram?.incompatibleWith || [];

            if (incompatibleWith.length) {
                const activeIncompatibleNames = incompatibleWith
                    .map((uuid) => activeProgramUuidToDisplay.get(uuid))
                    .filter((name): name is string => !!name);

                if (activeIncompatibleNames.length) {
                    result[program.uuid] = activeIncompatibleNames;
                }
            }
        });

        return result;
    }, [programConfig, programs, activeEnrollments]);

    // Filter out programs that patient is already enrolled in (active enrollments)
    // Also filter out programs that are incompatible with active enrollments
    const availablePrograms = useMemo(() => {
        const activeEnrollmentProgramUuids = new Set(
            activeEnrollments.map((e) => e.program.uuid),
        );
        return programs.filter((p) => {
            // Exclude programs the patient is already enrolled in
            if (activeEnrollmentProgramUuids.has(p.uuid)) {
                return false;
            }
            // Exclude programs that are incompatible with active enrollments
            const incompatibleWithNames = programIncompatibilities[p.uuid] || [];
            return incompatibleWithNames.length === 0;
        });
    }, [programs, activeEnrollments, programIncompatibilities]);

    const getCurrentStepIndex = (step: WizardStep): number => {
        const steps: WizardStep[] = ['select', 'details', 'review', 'success'];
        return steps.indexOf(step);
    };

    const handleProgramSelect = (programUuid: string) => {
        if (!programUuid) {
            return;
        }

        const program = programs.find((p) => p.uuid === programUuid);
        setSelectedProgram(programUuid);
        setSelectedProgramName(program?.display || '');
        setQuestionAnswers({});
        setCurrentStep('details');
    };

    const handleNextToReview = () => {
        if (!enrollmentDate) {
            showSnackbar({
                kind: 'error',
                title: t('programManager.error', 'Error'),
                subtitle: t('programManager.dateRequired', 'Please select an enrollment date'),
            });
            return;
        }

        // Validate required program questions based on enrollmentOptions
        if (selectedProgram && programConfig) {
            const configForProgram = (programConfig as any)[selectedProgram];
            const requiredQuestions: any[] =
                configForProgram?.enrollmentOptions?.requiredProgramQuestions || [];

            for (const q of requiredQuestions) {
                const value = questionAnswers[q.qtype];
                if (!value) {
                    showSnackbar({
                        kind: 'error',
                        title: t('programManager.error', 'Error'),
                        subtitle: t(
                            'programManager.answerRequiredQuestion',
                            'Please answer all required enrollment questions.',
                        ),
                    });
                    return;
                }

                // Simple equality check for enrollIf (do not evaluate expressions)
                if (q.enrollIf && value !== q.enrollIf) {
                    showSnackbar({
                        kind: 'error',
                        title: t('programManager.notEligible', 'Not Eligible for Program'),
                        subtitle:
                            q.notEligibleMessage ||
                            t(
                                'programManager.notEligibleDefault',
                                'Based on your responses, the patient is not eligible for this program.',
                            ),
                    });
                    return;
                }

                // Validate related questions that are shown
                if (Array.isArray(q.relatedQuestions)) {
                    for (const rq of q.relatedQuestions) {
                        const parentValue = value;
                        const shouldShow =
                            !rq.showIfParent || rq.showIfParent === parentValue;
                        if (shouldShow) {
                            const rqValue = questionAnswers[rq.qtype];
                            if (!rqValue) {
                                showSnackbar({
                                    kind: 'error',
                                    title: t('programManager.error', 'Error'),
                                    subtitle: t(
                                        'programManager.answerRequiredQuestion',
                                        'Please answer all required enrollment questions.',
                                    ),
                                });
                                return;
                            }
                            if (rq.enrollIf && rqValue !== rq.enrollIf) {
                                showSnackbar({
                                    kind: 'error',
                                    title: t('programManager.notEligible', 'Not Eligible for Program'),
                                    subtitle:
                                        rq.notEligibleMessage ||
                                        t(
                                            'programManager.notEligibleDefault',
                                            'Based on your responses, the patient is not eligible for this program.',
                                        ),
                                });
                                return;
                            }
                        }
                    }
                }
            }
        }

        setCurrentStep('review');
    };

    const handleBack = () => {
        if (currentStep === 'details') {
            setCurrentStep('select');
        } else if (currentStep === 'review') {
            setCurrentStep('details');
        }
    };

    const handleEnroll = async () => {
        if (!selectedProgram || !enrollmentDate) {
            showSnackbar({
                kind: 'error',
                title: t('programManager.error', 'Error'),
                subtitle: t('programManager.fillRequiredFields', 'Please fill all required fields'),
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const dateStr = dayjs(enrollmentDate).format('YYYY-MM-DD');
            await enrollPatientInProgram(patientUuid, selectedProgram, dateStr, locationUuid || undefined);
            await mutateEnrollments();
            setCurrentStep('success');
        showSnackbar({
            kind: 'success',
            title: t('programManager.enrollmentSuccess', 'Enrollment Successful'),
            subtitle: t('programManager.enrollmentSuccessDesc', 'Patient successfully enrolled in program.'),
        });
        } catch (error) {
            showSnackbar({
                kind: 'error',
                title: t('programManager.enrollmentError', 'Enrollment Failed'),
                subtitle:
                    (error instanceof Error ? error.message : String(error)) ||
                    t('programManager.enrollmentErrorDesc', 'Failed to enroll patient in program.'),
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStartOver = () => {
        setCurrentStep('select');
        setSelectedProgram('');
        setSelectedProgramName('');
        setEnrollmentDate(null);
        setLocationUuid('');
        setSelectedLocationName('');
    };

    const handleDisenroll = async (enrollmentUuid: string, enrollmentDisplay: string) => {
        const today = new Date();
        const dateStr = dayjs(today).format('YYYY-MM-DD');
        try {
            await disenrollPatientFromProgram(enrollmentUuid, dateStr);
            await mutateEnrollments();
            showSnackbar({
                kind: 'success',
                title: t('programManager.disenrollmentSuccess', 'Disenrollment Successful'),
                subtitle: t('programManager.disenrollmentSuccessDesc', 'Patient successfully disenrolled from program.'),
            });
        } catch (error) {
            showSnackbar({
                kind: 'error',
                title: t('programManager.disenrollmentError', 'Disenrollment Failed'),
                subtitle:
                    (error instanceof Error ? error.message : String(error)) ||
                    t('programManager.disenrollmentErrorDesc', 'Failed to disenroll patient from program.'),
            });
        }
    };

    const enrollmentHeaders = [
        { key: 'program', header: t('programManager.program', 'Program') },
        { key: 'dateEnrolled', header: t('programManager.dateEnrolled', 'Date Enrolled') },
        { key: 'dateCompleted', header: t('programManager.dateCompleted', 'Date Completed') },
        { key: 'location', header: t('programManager.location', 'Location') },
        { key: 'actions', header: t('programManager.actions', 'Actions') },
    ];
    console.log("activeEnrollments",activeEnrollments);
    const enrollmentRows = activeEnrollments.map((enrollment) => ({
        id: enrollment.uuid,
        program: enrollment.program.display,
        dateEnrolled: enrollment.dateEnrolled ? formatDatetime(new Date(enrollment.dateEnrolled)) : '-',
        dateCompleted: enrollment.dateCompleted ? formatDatetime(new Date(enrollment.dateCompleted)) : '-',
        location: enrollment.location?.display || '-',
        actions: (
            <Button
                kind="danger--tertiary"
                size="sm"
                onClick={() => handleDisenroll(enrollment.uuid, enrollment.program.display)}
            >
                {t('programManager.disenroll', 'Disenroll')}
            </Button>
        ),
    }));

    if (isLoadingPrograms || isLoadingEnrollments || isLoadingProgramConfig) {
    return (
            <Workspace2 title={t('programManager.title', 'Program Manager')}>
                <div className={styles.workspaceContent}>
                    <DataTableSkeleton columnCount={5} rowCount={5} />
                </div>
            </Workspace2>
        );
    }

    const renderWizardContent = () => {
        if (currentStep === 'select') {
            return (
                <div className={styles.wizardStep}>
                    <h3 className={styles.stepTitle}>{t('programManager.selectProgram', 'Select Program')}</h3>
                    <p className={styles.stepDescription}>
                        {t('programManager.selectProgramDescription', 'Choose a program to enroll the patient in')}
                    </p>
                <FormGroup legendText={t('programManager.selectProgram', 'Select Program')}>
                        <ComboBox
                            id="program-select"
                            titleText={t('programManager.program', 'Program')}
                            placeholder={t('programManager.chooseProgram', 'Choose a program')}
                            items={availablePrograms.map((program) => ({
                                id: program.uuid,
                                text: program.display,
                            }))}
                            itemToString={(item) => (item ? item.text : '')}
                            onChange={({ selectedItem }) => {
                                if (selectedItem) {
                                    handleProgramSelect(selectedItem.id);
                                } else {
                                    // Clear selection if user clears the combobox
                                    setSelectedProgram('');
                                    setSelectedProgramName('');
                                }
                            }}
                            selectedItem={
                                selectedProgram
                                    ? {
                                          id: selectedProgram,
                                          text: availablePrograms.find((p) => p.uuid === selectedProgram)?.display || '',
                                      }
                                    : null
                            }
                        />
                </FormGroup>
                    <div className={styles.wizardActions}>
                        <Button kind="secondary" onClick={closeWorkspace}>
                            {t('cancel', 'Cancel')}
                        </Button>
                    </div>
                </div>
            );
        }

        if (currentStep === 'details') {
            const selectedConfig = selectedProgram ? (programConfig as any)?.[selectedProgram] : null;
            const requiredQuestions: any[] =
                selectedConfig?.enrollmentOptions?.requiredProgramQuestions || [];

            return (
                <div className={styles.wizardStep}>
                    <h3 className={styles.stepTitle}>{t('programManager.enrollmentDetails', 'Enrollment Details')}</h3>
                    <p className={styles.stepDescription}>
                        {t('programManager.enrollmentDetailsDescription', 'Enter enrollment date, location, and required details')}
                    </p>
                    <Form className={styles.form}>
                        {/* Dynamic enrollment questions from enrollmentOptions */}
                        {requiredQuestions.length > 0 && (
                            <FormGroup legendText={t('programManager.requiredQuestions', 'Required Enrollment Questions')}>
                                {requiredQuestions.map((q) => (
                                    <div key={q.qtype} className={styles.questionGroup}>
                                        <Select
                                            id={`question-${q.qtype}`}
                                            labelText={q.name}
                                            value={questionAnswers[q.qtype] || ''}
                                            onChange={(e) =>
                                                setQuestionAnswers((prev) => ({
                                                    ...prev,
                                                    [q.qtype]: e.target.value,
                                                }))
                                            }
                                        >
                                            <SelectItem disabled hidden value="" text={t('programManager.chooseAnswer', 'Choose an answer')} />
                                            {Array.isArray(q.answers) &&
                                                q.answers.map((ans: any) => (
                                                    <SelectItem
                                                        key={ans.value}
                                                        value={ans.value}
                                                        text={ans.label}
                                                    />
                                                ))}
                                        </Select>
                                        {/* Related questions that depend on this answer */}
                                        {Array.isArray(q.relatedQuestions) &&
                                            q.relatedQuestions.map((rq: any) => {
                                                const parentValue = questionAnswers[q.qtype];
                                                const shouldShow =
                                                    !rq.showIfParent || rq.showIfParent === parentValue;
                                                if (!shouldShow) {
                                                    return null;
                                                }
                                                return (
                                                    <div key={rq.qtype} className={styles.relatedQuestion}>
                                                        <Select
                                                            id={`question-${rq.qtype}`}
                                                            labelText={rq.name}
                                                            value={questionAnswers[rq.qtype] || ''}
                                                            onChange={(e) =>
                                                                setQuestionAnswers((prev) => ({
                                                                    ...prev,
                                                                    [rq.qtype]: e.target.value,
                                                                }))
                                                            }
                                                        >
                                                            <SelectItem
                                                                disabled
                                                                hidden
                                                                value=""
                                                                text={t('programManager.chooseAnswer', 'Choose an answer')}
                                                            />
                                                            {Array.isArray(rq.answers) &&
                                                                rq.answers.map((ans: any) => (
                                                                    <SelectItem
                                                                        key={ans.value}
                                                                        value={ans.value}
                                                                        text={ans.label}
                                                                    />
                                                                ))}
                                                        </Select>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                ))}
                            </FormGroup>
                        )}

                <FormGroup legendText={t('programManager.enrollmentDetails', 'Enrollment Details')}>
                            <DatePicker
                                datePickerType="single"
                                dateFormat="Y-m-d"
                                value={enrollmentDate}
                                onChange={([date]) => setEnrollmentDate(date)}
                            >
                        <DatePickerInput
                            id="date-picker-input-id"
                            placeholder="mm/dd/yyyy"
                                    labelText={t('programManager.dateEnrolled', 'Date Enrolled')}
                        />
                    </DatePicker>
                </FormGroup>

                        <FormGroup legendText={t('programManager.location', 'Location')}>
                            <div className={styles.locationPickerWrapper}>
                                <LocationPicker
                                    selectedLocationUuid={locationUuid}
                                    defaultLocationUuid={sessionLocation?.uuid}
                                    onChange={(newLocationUuid) => setLocationUuid(newLocationUuid || '')}
                                />
                            </div>
                        </FormGroup>
                    </Form>
                    <div className={styles.wizardActions}>
                        <Button kind="secondary" onClick={handleBack}>
                            {t('programManager.back', 'Back')}
                        </Button>
                        <Button onClick={handleNextToReview}>{t('programManager.next', 'Next')}</Button>
                    </div>
                </div>
            );
        }

        if (currentStep === 'review') {
            return (
                <div className={styles.wizardStep}>
                    <h3 className={styles.stepTitle}>{t('programManager.review', 'Review Enrollment')}</h3>
                    <p className={styles.stepDescription}>
                        {t('programManager.reviewDescription', 'Please review the enrollment details before submitting')}
                    </p>
                    <div className={styles.reviewList}>
                        <div className={styles.reviewItem}>
                            <div className={styles.reviewLabel}>{t('programManager.program', 'Program')}</div>
                            <div className={styles.reviewValue}>{selectedProgramName}</div>
                        </div>
                        <div className={styles.reviewItem}>
                            <div className={styles.reviewLabel}>{t('programManager.dateEnrolled', 'Date Enrolled')}</div>
                            <div className={styles.reviewValue}>
                                {enrollmentDate ? formatDatetime(enrollmentDate) : '-'}
                            </div>
                        </div>
                        <div className={styles.reviewItem}>
                            <div className={styles.reviewLabel}>{t('programManager.location', 'Location')}</div>
                            <div className={styles.reviewValue}>
                                {selectedLocationName || t('programManager.notSpecified', 'Not specified')}
                            </div>
                        </div>
                        {/* Show summary of enrollment questions */}
                        {selectedProgram && (programConfig as any)?.[selectedProgram]?.enrollmentOptions?.requiredProgramQuestions && (
                            <div className={styles.reviewItem}>
                                <div className={styles.reviewLabel}>
                                    {t('programManager.requiredQuestions', 'Required Enrollment Questions')}
                                </div>
                                <div className={styles.reviewValue}>
                                    <ul className={styles.infoList}>
                                        {((programConfig as any)[selectedProgram].enrollmentOptions
                                            .requiredProgramQuestions as any[]).map((q: any) => {
                                            const value = questionAnswers[q.qtype];
                                            if (!value) {
                                                return null;
                                            }
                                            const label =
                                                q.answers?.find((a: any) => a.value === value)?.label || value;
                                            return (
                                                <li key={q.qtype}>
                                                    <strong>{q.name}:</strong> {label}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className={styles.wizardActions}>
                        <Button kind="secondary" onClick={handleBack} disabled={isSubmitting}>
                            {t('programManager.back', 'Back')}
                        </Button>
                        {isSubmitting ? (
                            <InlineLoading description={t('programManager.submitting', 'Submitting')} />
                        ) : (
                            <Button onClick={handleEnroll}>{t('programManager.enroll', 'Enroll')}</Button>
                        )}
                    </div>
                </div>
            );
        }

        if (currentStep === 'success') {
            return (
                <div className={styles.wizardStep}>
                    <div className={styles.successState}>
                        <h3 className={styles.stepTitle}>{t('programManager.enrollmentSuccess', 'Enrollment Successful')}</h3>
                        <p className={styles.stepDescription}>
                            {t(
                                'programManager.enrollmentSuccessMessage',
                                'The patient has been successfully enrolled in the program.',
                            )}
                        </p>
                        <div className={styles.reviewList}>
                            <div className={styles.reviewItem}>
                                <div className={styles.reviewLabel}>{t('programManager.program', 'Program')}</div>
                                <div className={styles.reviewValue}>{selectedProgramName}</div>
                            </div>
                            <div className={styles.reviewItem}>
                                <div className={styles.reviewLabel}>{t('programManager.dateEnrolled', 'Date Enrolled')}</div>
                                <div className={styles.reviewValue}>
                                    {enrollmentDate ? formatDatetime(enrollmentDate) : '-'}
                                </div>
                            </div>
                            <div className={styles.reviewItem}>
                                <div className={styles.reviewLabel}>{t('programManager.location', 'Location')}</div>
                                <div className={styles.reviewValue}>
                                    {selectedLocationName || t('programManager.notSpecified', 'Not specified')}
                                </div>
                            </div>
                        </div>
                        <div className={styles.wizardActions}>
                            <Button kind="secondary" onClick={handleStartOver}>
                                {t('programManager.enrollAnother', 'Enroll in Another Program')}
                    </Button>
                            <Button onClick={closeWorkspace}>{t('programManager.done', 'Done')}</Button>
                        </div>
                    </div>
                </div>
            );
        }
    };

    const showWizard = currentStep !== 'success' && availablePrograms.length > 0;
    
    return (
        <Workspace2 title={t('programManager.title', 'Program Manager')}>
            <div className={styles.workspaceContent}>
                {/* Current Enrollments */}
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t('programManager.currentEnrollments', 'Current Enrollments')}</h3>
                    {activeEnrollments.length > 0 ? (
                        <DataTable rows={enrollmentRows} headers={enrollmentHeaders} isSortable>
                            {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                                <Table {...getTableProps()}>
                                    <TableHead>
                                        <TableRow>
                                            {headers.map((header) => (
                                                <TableHeader {...getHeaderProps({ header })}>{header.header}</TableHeader>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {rows.map((row) => (
                                            <TableRow {...getRowProps({ row })}>
                                                {row.cells.map((cell) => (
                                                    <TableCell key={cell.id}>{cell.value}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </DataTable>
                    ) : (
                        <Tile className={styles.emptyState}>
                            {t('programManager.noEnrollments', 'No program enrollments found')}
                        </Tile>
                    )}
                </section>

                {/* Wizard for New Enrollment */}
                {showWizard && (
                    <section className={styles.section}>
                        <h3 className={styles.sectionTitle}>{t('programManager.enrollNewProgram', 'Enroll in New Program')}</h3>
                        <ProgressIndicator currentIndex={getCurrentStepIndex(currentStep)} className={styles.progressIndicator}>
                            <ProgressStep
                                complete={getCurrentStepIndex(currentStep) > 0}
                                current={currentStep === 'select'}
                                label={t('programManager.selectProgram', 'Select Program')}
                            />
                            <ProgressStep
                                complete={getCurrentStepIndex(currentStep) > 1}
                                current={currentStep === 'details'}
                                label={t('programManager.enrollmentDetails', 'Enrollment Details')}
                            />
                            <ProgressStep
                                complete={getCurrentStepIndex(currentStep) > 2}
                                current={currentStep === 'review'}
                                label={t('programManager.review', 'Review')}
                            />
                        </ProgressIndicator>
                        {renderWizardContent()}
                    </section>
                )}

                {currentStep === 'success' && (
                    <section className={styles.section}>
                        <ProgressIndicator currentIndex={3} className={styles.progressIndicator}>
                            <ProgressStep complete label={t('programManager.selectProgram', 'Select Program')} />
                            <ProgressStep complete label={t('programManager.enrollmentDetails', 'Enrollment Details')} />
                            <ProgressStep complete label={t('programManager.review', 'Review')} />
                        </ProgressIndicator>
                        {renderWizardContent()}
                    </section>
                )}

                {availablePrograms.length === 0 && activeEnrollments.length > 0 && currentStep === 'select' && (
                    <Tile className={styles.emptyState}>
                        {t('programManager.allProgramsEnrolled', 'Patient is enrolled in all available programs')}
                    </Tile>
                )}
        </div>
        </Workspace2>
    );
};

export default ProgramManagerWorkspace;
