from django.urls import path

from . import views

urlpatterns = [
    path("reports/places/", views.PlacesReportView.as_view(), name="report-places"),
    path("reports/parking/", views.ParkingReportView.as_view(), name="report-parking"),
    path("reports/employees/", views.EmployeesReportView.as_view(), name="report-employees"),
]
