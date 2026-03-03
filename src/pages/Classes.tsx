import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockClasses, mockStudents } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui-custom/StatusBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, MoveHorizontal as MoreHorizontal, Users, Clock, MapPin, Pencil, Trash2, Calendar, BookOpen } from 'lucide-react';
import type { Class } from '@/types';

export function Classes() {
  const { t } = useTranslation();
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const getEnrolledStudents = (classId: string) => {
    return mockStudents.filter((student) => student.classes.includes(classId));
  };

  const getDayLabel = (day: string) => {
    const days: Record<string, string> = {
      monday: t('classes.monday'),
      tuesday: t('classes.tuesday'),
      wednesday: t('classes.wednesday'),
      thursday: t('classes.thursday'),
      friday: t('classes.friday'),
      saturday: t('classes.saturday'),
      sunday: t('classes.sunday'),
    };
    return days[day] || day;
  };

  const handleViewDetails = (cls: Class) => {
    setSelectedClass(cls);
    setIsDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('classes.title')}</h1>
          <p className="text-muted-foreground">{t('classes.classList')}</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('classes.addClass')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('classes.addClass')}</DialogTitle>
              <VisuallyHidden>
                <DialogDescription>Add a new class to the system</DialogDescription>
              </VisuallyHidden>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('classes.className')}</Label>
                <Input id="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('classes.description')}</Label>
                <Input id="description" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teacher">{t('classes.teacher')}</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Maria Garcia</SelectItem>
                    <SelectItem value="5">Anna Martinez</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="room">{t('classes.room')}</Label>
                  <Input id="room" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxCapacity">{t('classes.maxCapacity')}</Label>
                  <Input id="maxCapacity" type="number" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button>{t('common.save')}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mockClasses.map((cls) => {
          const enrolledCount = getEnrolledStudents(cls.id).length;
          
          return (
            <Card key={cls.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{cls.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{cls.teacherName}</p>
                  </div>
                  <StatusBadge status={cls.status} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {cls.description}
                </p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {cls.schedule.map((s) => getDayLabel(s.day)).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{cls.room}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {enrolledCount} / {cls.maxCapacity} {t('classes.studentsEnrolled')}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleViewDetails(cls)}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    {t('common.view')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Class Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedClass && (
            <>
              <DialogHeader>
                <VisuallyHidden>
                  <DialogDescription>Class details</DialogDescription>
                </VisuallyHidden>
                <DialogTitle>{selectedClass.name}</DialogTitle>
              </DialogHeader>
              
              <Tabs defaultValue="info" className="mt-4">
                <TabsList>
                  <TabsTrigger value="info">{t('classes.classDetails')}</TabsTrigger>
                  <TabsTrigger value="students">{t('classes.studentsEnrolled')}</TabsTrigger>
                  <TabsTrigger value="schedule">{t('classes.schedule')}</TabsTrigger>
                </TabsList>
                
                <TabsContent value="info" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">{t('classes.teacher')}</Label>
                      <p className="font-medium">{selectedClass.teacherName}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('classes.room')}</Label>
                      <p className="font-medium">{selectedClass.room}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('classes.maxCapacity')}</Label>
                      <p className="font-medium">{selectedClass.maxCapacity}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{t('classes.status')}</Label>
                      <div className="mt-1">
                        <StatusBadge status={selectedClass.status} />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t('classes.description')}</Label>
                    <p className="mt-1">{selectedClass.description}</p>
                  </div>
                </TabsContent>
                
                <TabsContent value="students">
                  <div className="space-y-2">
                    {getEnrolledStudents(selectedClass.id).map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">{student.email}</p>
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {getEnrolledStudents(selectedClass.id).length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        {t('common.noData')}
                      </p>
                    )}
                  </div>
                </TabsContent>
                
                <TabsContent value="schedule">
                  <div className="space-y-2">
                    {selectedClass.schedule.map((schedule, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-3 border rounded-lg"
                      >
                        <Calendar className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">{getDayLabel(schedule.day)}</p>
                          <p className="text-sm text-muted-foreground">
                            {schedule.startTime} - {schedule.endTime}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
