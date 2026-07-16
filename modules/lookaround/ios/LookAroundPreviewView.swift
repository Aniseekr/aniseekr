import CoreLocation
import ExpoModulesCore
import MapKit
import QuartzCore
import UIKit

public final class LookAroundPreviewView: ExpoView {
  let onSceneUnavailable = EventDispatcher()

  var latitude: Double?
  var longitude: Double?

  private let contentView = UIView()
  private var sceneRequest: MKLookAroundSceneRequest?
  private var lookAroundViewController: MKLookAroundViewController?
  private var requestedCoordinateKey: String?
  private var reduceMotionObserver: NSObjectProtocol?

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    contentView.frame = bounds
    contentView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(contentView)

    reduceMotionObserver = NotificationCenter.default.addObserver(
      forName: UIAccessibility.reduceMotionStatusDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.updateMotionAnimation()
    }
  }

  deinit {
    sceneRequest?.cancel()
    if let reduceMotionObserver {
      NotificationCenter.default.removeObserver(reduceMotionObserver)
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    contentView.frame = bounds
    lookAroundViewController?.view.frame = contentView.bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()

    if window == nil {
      stopMotionAnimation()
      detachLookAroundControllerFromParent()
      return
    }

    attachLookAroundControllerToParentIfNeeded()
    updateMotionAnimation()
  }

  func reloadSceneIfNeeded() {
    guard let latitude, let longitude else {
      return
    }

    guard let coordinate = makeCoordinate(latitude: latitude, longitude: longitude) else {
      requestedCoordinateKey = nil
      sceneRequest?.cancel()
      sceneRequest = nil
      removeLookAroundController()
      sendSceneUnavailable(latitude: latitude, longitude: longitude)
      return
    }

    let coordinateKey = "\(latitude),\(longitude)"
    if requestedCoordinateKey == coordinateKey {
      return
    }

    requestedCoordinateKey = coordinateKey
    loadScene(for: coordinate, coordinateKey: coordinateKey)
  }

  @available(iOS 16.0, *)
  private func makeLookAroundViewController(scene: MKLookAroundScene) -> MKLookAroundViewController {
    let viewController = MKLookAroundViewController(scene: scene)
    viewController.isNavigationEnabled = false
    viewController.badgePosition = .topTrailing
    viewController.view.frame = contentView.bounds
    viewController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    return viewController
  }

  private func loadScene(for coordinate: CLLocationCoordinate2D, coordinateKey: String) {
    guard #available(iOS 16.0, *) else {
      removeLookAroundController()
      sendSceneUnavailable(latitude: coordinate.latitude, longitude: coordinate.longitude)
      return
    }

    sceneRequest?.cancel()

    let request = MKLookAroundSceneRequest(coordinate: coordinate)
    sceneRequest = request

    request.getSceneWithCompletionHandler { [weak self] scene, _ in
      DispatchQueue.main.async {
        guard let self,
          self.requestedCoordinateKey == coordinateKey
        else {
          return
        }

        self.sceneRequest = nil

        guard let scene else {
          self.removeLookAroundController()
          self.sendSceneUnavailable(latitude: coordinate.latitude, longitude: coordinate.longitude)
          return
        }

        self.installLookAroundController(self.makeLookAroundViewController(scene: scene))
      }
    }
  }

  private func installLookAroundController(_ viewController: MKLookAroundViewController) {
    removeLookAroundController()

    lookAroundViewController = viewController
    let parentViewController = nearestViewController() ?? rootPresentingViewController()
    parentViewController?.addChild(viewController)
    contentView.addSubview(viewController.view)
    if let parentViewController {
      viewController.didMove(toParent: parentViewController)
    }
    updateMotionAnimation()
  }

  private func attachLookAroundControllerToParentIfNeeded() {
    guard let lookAroundViewController,
      lookAroundViewController.parent == nil,
      let parentViewController = nearestViewController() ?? rootPresentingViewController()
    else {
      return
    }

    parentViewController.addChild(lookAroundViewController)
    lookAroundViewController.didMove(toParent: parentViewController)
  }

  private func removeLookAroundController() {
    stopMotionAnimation()

    guard let lookAroundViewController else {
      return
    }

    detachLookAroundControllerFromParent()
    lookAroundViewController.view.removeFromSuperview()
    self.lookAroundViewController = nil
  }

  private func detachLookAroundControllerFromParent() {
    guard let lookAroundViewController,
      lookAroundViewController.parent != nil
    else {
      return
    }

    lookAroundViewController.willMove(toParent: nil)
    lookAroundViewController.removeFromParent()
  }

  private func updateMotionAnimation() {
    guard window != nil,
      lookAroundViewController != nil,
      !UIAccessibility.isReduceMotionEnabled
    else {
      stopMotionAnimation()
      return
    }

    guard contentView.layer.animation(forKey: "lookaround-preview-motion") == nil else {
      return
    }

    let animation = CABasicAnimation(keyPath: "transform.scale")
    animation.fromValue = 1.0
    animation.toValue = 1.06
    animation.duration = 12
    animation.autoreverses = true
    animation.repeatCount = .infinity
    animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    contentView.layer.add(animation, forKey: "lookaround-preview-motion")
  }

  private func stopMotionAnimation() {
    contentView.layer.removeAnimation(forKey: "lookaround-preview-motion")
    contentView.transform = .identity
  }

  private func sendSceneUnavailable(latitude: Double, longitude: Double) {
    onSceneUnavailable([
      "latitude": latitude,
      "longitude": longitude
    ])
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let nextResponder = responder?.next {
      if let viewController = nextResponder as? UIViewController {
        return viewController
      }
      responder = nextResponder
    }
    return nil
  }
}
